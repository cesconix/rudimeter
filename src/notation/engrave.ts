import {
  BarlineType,
  Beam,
  Dot,
  Formatter,
  GhostNote,
  type RenderContext,
  Renderer,
  RendererBackends,
  Stave,
  StaveNote,
  Stem,
  type StemmableNote,
  Tuplet,
  Voice,
  VoiceMode,
} from 'vexflow/bravura'
import { resolveBeams } from '../score/beaming'
import { type FlatEvent, flattenVoice, metersOf } from '../score/events'
import { type EventId, keyOf } from '../score/ids'
import type { Catalogue } from '../score/instruments'
import type { Event, Meter, Note, Notehead, Part, Score, Voice as ScoreVoice } from '../score/types'
import {
  type BarLayout,
  type EventBox,
  type Layout,
  type RowLayout,
  STAFF_H,
  STAFF_LINES,
  STAFF_TOP,
  SYSTEM_H,
} from './layout'

/**
 * Notehead codes VexFlow resolves by duration (`Tables.codeNoteHead`): an x on a half note is the
 * open x, on a quarter the filled one. The two-digit codes (`x2`, `d2`…) are one fixed glyph each.
 */
const HEAD_CODES: Record<Notehead, string> = {
  normal: '',
  x: 'x',
  'circle-x': 'cx',
  diamond: 'di',
  triangle: 'tu',
  slash: 's',
}
const NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

/**
 * Catalogue line → VexFlow key. The percussion clef uses the treble map: line 0, the bottom line,
 * is e/4 and every half line is one name up, so the snare on line 2.5 is c/5 — the third space,
 * where the old renderer's `KEY_5_LINE` put it.
 */
export function keyForLine(line: number, head: Notehead = 'normal'): string {
  const step = Math.round(line * 2) + 2 // e is the third name of octave 4
  const name = NAMES[((step % 7) + 7) % 7]
  const octave = 4 + Math.floor(step / 7)
  const code = HEAD_CODES[head]
  return code ? `${name}/${octave}/${code}` : `${name}/${octave}`
}

/**
 * Where a rest sits. Alone in the bar, on the middle line; with a second voice the hands' rests
 * move up and the feet's down, so the two never print on top of each other.
 */
const REST_KEY = { single: 'b/4', up: 'd/5', down: 'g/4' } as const

export interface EngravedRow {
  el: SVGSVGElement
  dispose(): void
}

/**
 * One event as VexFlow holds it, with the box the time grid puts it in. `keyIndex` and `notes` are
 * unread here: the next task's ties and per-note modifiers (accent, sticking, open/closed) key off
 * them to find which VexFlow key on a chord is which instrument.
 */
interface Placed {
  note: StemmableNote
  /** undefined for a hidden rest: it has a box in the layout but nothing to align */
  box: EventBox | undefined
  /** instrument → index in the note's keys (sorted low to high, as VexFlow wants them) */
  keyIndex: Map<string, number>
  /** the event's notes in key order */
  notes: Note[]
}

/** `part`, `index` and `flat` are unread here: the next task's ties and hairpins need the voice they belong to and its flat events to find a run's start and end. */
interface BuiltVoice {
  part: Part
  index: number
  flat: FlatEvent[]
  placed: Placed[]
  vf: Voice
  beams: Beam[]
  tuplets: Tuplet[]
}

function buildNote(event: Event, dir: number, catalogue: Catalogue, restKey: string): Omit<Placed, 'box'> {
  const dots = event.duration.dots ?? 0
  const duration = String(event.duration.base)
  const keyIndex = new Map<string, number>()
  // A hidden rest takes its ticks and draws nothing: the other voice fills that time.
  if (event.hidden) return { note: new GhostNote({ duration, dots }), keyIndex, notes: [] }
  if (event.rest) {
    const rest = new StaveNote({ keys: [restKey], duration, dots, type: 'r', stemDirection: dir })
    // One `buildAndAttach` call draws one dot: the struct's `dots` only set the ticks, so a double dot needs two calls.
    for (let i = 0; i < dots; i++) Dot.buildAndAttach([rest], { all: true })
    return { note: rest, keyIndex, notes: [] }
  }
  // Low to high: VexFlow displaces the noteheads of a chord from that order.
  const notes = [...(event.notes ?? [])].sort((a, b) => catalogue[a.instrument].line - catalogue[b.instrument].line)
  notes.forEach((n, i) => {
    keyIndex.set(n.instrument, i)
  })
  const keys = notes.map((n) => keyForLine(catalogue[n.instrument].line, n.head ?? catalogue[n.instrument].head))
  const note = new StaveNote({ keys, duration, dots, stemDirection: dir })
  // One `buildAndAttach` call draws one dot: the struct's `dots` only set the ticks, so a double dot needs two calls.
  for (let i = 0; i < dots; i++) Dot.buildAndAttach([note], { all: true })
  return { note, keyIndex, notes }
}

function buildVoice(
  layout: Layout,
  bar: BarLayout,
  meter: Meter,
  beamsSpec: number[] | undefined,
  part: Part,
  index: number,
  voice: ScoreVoice,
  catalogue: Catalogue,
  twoVoices: boolean,
): BuiltVoice {
  const dir = voice.stem === 'up' ? Stem.UP : Stem.DOWN
  const restKey = twoVoices ? (voice.stem === 'up' ? REST_KEY.up : REST_KEY.down) : REST_KEY.single
  const flat = flattenVoice(voice)
  const placed: Placed[] = flat.map((f) => {
    const id: EventId = { bar: bar.barIndex, part: part.id, voice: index, item: f.item }
    if (f.sub !== undefined) id.sub = f.sub
    return { ...buildNote(f.event, dir, catalogue, restKey), box: layout.boxes.get(keyOf(id)) }
  })
  // SOFT: a voice that overflows or underfills its bar (validation reports it) still draws instead of throwing.
  const vf = new Voice({ numBeats: meter[0], beatValue: meter[1] })
    .setMode(VoiceMode.SOFT)
    .addTickables(placed.map((p) => p.note))

  // A tuplet is its consecutive flat events, whatever they draw: a hidden rest inside keeps its tick.
  const tuplets: Tuplet[] = []
  for (let i = 0; i < flat.length; ) {
    const group = flat[i].tuplet
    if (!group) {
      i++
      continue
    }
    let j = i
    while (j < flat.length && flat[j].tuplet === group) j++
    tuplets.push(
      new Tuplet(
        placed.slice(i, j).map((p) => p.note),
        {
          numNotes: group.tuplet.actual,
          notesOccupied: group.tuplet.normal,
          // VexFlow writes the ratio (`6:4`) when the two numbers differ by more than one; drum books write `6`.
          ratioed: false,
          location: dir === Stem.UP ? Tuplet.LOCATION_TOP : Tuplet.LOCATION_BOTTOM,
        },
      ),
    )
    i = j
  }

  // Beams from the marks: a run from `begin` to `end`. `resolveBeams` never marks a hidden rest, so every note in a run is a StaveNote.
  const marks = resolveBeams(meter, beamsSpec, flat)
  const beams: Beam[] = []
  let run: StaveNote[] = []
  marks.forEach((mark, i) => {
    if (mark === null) return
    run.push(placed[i].note as StaveNote)
    if (mark === 'end') {
      beams.push(new Beam(run, false))
      run = []
    }
  })
  return { part, index, flat, placed, vf, beams, tuplets }
}

/**
 * Rewrites the x of every tick context onto the time grid. The formatter has done its job — stems,
 * beams, modifier widths, the voices joined into shared tick contexts — and that stays; only WHERE
 * each instant lands moves, because typographic spacing gives four sixteenths 2.6 times the width
 * of the quarter they last (measured on the old renderer: 157 px/s against a cursor at 60 px/s),
 * and a cursor gliding over that tells the eye a speed that does not exist.
 *
 * The tick context moves, not the note: beams, tuplets, ties and modifiers read the position at
 * draw time and follow. It moves once per instant even when two voices share it — moving the notes
 * would move a shared one twice. The anchor is the first real note at that instant: its notehead's
 * left edge goes to its box's x (a delta, not an absolute: the offset between the context's x and
 * the notehead — displacement, stem width — need not be known). An instant with only hidden rests
 * keeps the formatter's x: it draws nothing.
 */
function placeOnGrid(formatter: Formatter, voices: BuiltVoice[]): void {
  const boxOf = new Map<StemmableNote, EventBox>()
  for (const v of voices) for (const p of v.placed) if (p.box) boxOf.set(p.note, p.box)
  for (const tc of formatter.getTickContexts()?.array ?? []) {
    const anchor = tc.getTickables().find((t) => t instanceof StaveNote) as StaveNote | undefined
    const box = anchor && boxOf.get(anchor)
    if (!anchor || !box) continue
    tc.setX(tc.getX() + (box.x - anchor.getNoteHeadBeginX()))
  }
}

/** Small grey text in the band above the staff: bar numbers, and the "×N" of a repeat played more than twice. */
function label(ctx: RenderContext, stave: Stave, text: string, x: number): void {
  ctx.save()
  ctx.setFont('system-ui, sans-serif', 13)
  ctx.setFillStyle('#888')
  ctx.fillText(text, x, stave.getYForLine(0) - 8)
  ctx.restore()
}

function engraveBar(
  ctx: RenderContext,
  score: Score,
  catalogue: Catalogue,
  layout: Layout,
  bar: BarLayout,
  meters: Meter[],
): void {
  const written = score.bars[bar.barIndex]
  const meter = meters[bar.barIndex]
  // `spaceAboveStaffLn` is in line spaces: it is what VexFlow reads to place the first line inside
  // the band, so it must move with STAFF_TOP — the band is the layout's, the staff's place in it is VexFlow's.
  const stave = new Stave(bar.x - bar.head, 0, bar.head + bar.width, {
    numLines: STAFF_LINES,
    spaceAboveStaffLn: STAFF_TOP / 10,
    spaceBelowStaffLn: (SYSTEM_H - STAFF_TOP - STAFF_H) / 10,
  })
  if (bar.showClef) stave.addClef('percussion')
  if (bar.showMeter) stave.addTimeSignature(`${meter[0]}/${meter[1]}`)
  if (bar.barIndex === score.bars.length - 1) stave.setEndBarType(BarlineType.END)
  stave.setContext(ctx).draw()
  // Only at the start of the row: with twenty identical repeats it is the only thing that says WHERE
  // you are. Above the staff, not to the left — the left has the clef. Written bar numbers, 1-based.
  if (bar.showClef) label(ctx, stave, String(bar.barIndex + 1), 0)
  if (written.simile) return

  const voices: BuiltVoice[] = []
  for (const part of score.parts) {
    const pb = written.parts?.[part.id]
    if (!pb) continue
    const two = pb.voices.length > 1
    pb.voices.forEach((voice, v) => {
      voices.push(buildVoice(layout, bar, meter, written.beams, part, v, voice, catalogue, two))
    })
  }
  if (voices.length === 0) return
  const vf = voices.map((v) => v.vf)
  // The stave must be on the notes BEFORE they are measured: `formatToStave` uses it for the width
  // but does not attach it, and until they have it `getNoteHeadBeginX()` answers without the
  // start-of-notes offset — a constant error per bar (measured on the old renderer: +66.1 px on
  // the first bar, +279 on the second), i.e. the right grid in the wrong place.
  for (const v of voices) {
    v.vf.setStave(stave)
    for (const p of v.placed) p.note.setStave(stave)
  }
  // Formatted and drawn in two passes, not `Formatter.FormatAndDraw`: the grid runs between the two.
  const formatter = new Formatter().joinVoices(vf)
  formatter.formatToStave(vf, stave)
  placeOnGrid(formatter, voices)
  for (const v of voices) v.vf.draw(ctx, stave)
  for (const v of voices) {
    for (const b of v.beams) b.setContext(ctx).draw()
    for (const t of v.tuplets) t.setContext(ctx).draw()
  }
}

/**
 * Draws one row of the layout into one `<svg>` appended to `host`, absolutely positioned at the
 * row's y. One SVG per row is what lets a pool keep only the visible rows alive (`rows.ts`).
 *
 * Do not call before `notationFontsReady()` has resolved: VexFlow measures glyphs by reading the
 * DOM, and a row engraved before the music font is applied etches wrong x coordinates that are
 * never recomputed.
 */
export function engraveRow(
  host: HTMLElement,
  score: Score,
  catalogue: Catalogue,
  layout: Layout,
  row: RowLayout,
  scale: number,
): EngravedRow {
  const mount = document.createElement('div')
  const renderer = new Renderer(mount, RendererBackends.SVG)
  const height = SYSTEM_H * scale
  renderer.resize(row.widthNatural * scale, height)
  const ctx = renderer.getContext()
  // One scale over the whole context: glyphs, spacing and row height keep their ratio. Scaling the
  // bars alone would leave the glyphs at their size and put the noteheads on top of each other on a packed row.
  ctx.scale(scale, scale)
  const meters = metersOf(score)
  for (const bar of row.bars) engraveBar(ctx, score, catalogue, layout, bar, meters)
  const el = mount.querySelector('svg') as SVGSVGElement
  el.style.position = 'absolute'
  el.style.left = '0'
  el.style.top = `${row.index * height}px`
  host.appendChild(el)
  return { el, dispose: () => el.remove() }
}
