import VexFlow, {
  Annotation,
  AnnotationVerticalJustify,
  Articulation,
  BarlineType,
  Beam,
  Dot,
  type Element,
  Formatter,
  GhostNote,
  GraceNote,
  GraceNoteGroup,
  Metrics,
  ModifierPosition,
  Parenthesis,
  type RenderContext,
  Renderer,
  RendererBackends,
  RepeatNote,
  Stave,
  StaveHairpin,
  StaveNote,
  StaveTie,
  Stem,
  type StemmableNote,
  Tremolo,
  Tuplet,
  Voice,
  VoiceMode,
  VoltaType,
} from 'vexflow/bravura'
import { resolveBeams } from '../score/beaming'
import { type FlatEvent, flattenVoice, metersOf } from '../score/events'
import { type EventId, keyOf } from '../score/ids'
import type { Catalogue } from '../score/instruments'
import type {
  Dynamic,
  Event,
  InstrumentId,
  Meter,
  Note,
  Notehead,
  Part,
  Score,
  Voice as ScoreVoice,
} from '../score/types'
import { BuzzRoll } from './buzz-roll'
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

// `Glyphs` (the SMuFL enum) is not a named export of 'vexflow/bravura' — only the default `VexFlow`
// object carries it (`VexFlow.Glyphs`) — so it is read off the default export once, here.
const Glyphs = VexFlow.Glyphs

const DYNAMIC_GLYPHS: Record<Dynamic, string> = {
  pp: Glyphs.dynamicPP,
  p: Glyphs.dynamicPiano,
  mp: Glyphs.dynamicMP,
  mf: Glyphs.dynamicMF,
  f: Glyphs.dynamicForte,
  ff: Glyphs.dynamicFF,
}

/**
 * A SMuFL glyph as an annotation, in the music font at the size the noteheads use, so a dynamic or
 * an open-hi-hat circle prints like the rest of the staff and not like a 10 pt label. An annotation
 * and not a `TextDynamics`: that one is a Note, it would need a voice and a tick of its own, while
 * an annotation rides the event's modifier context and stacks under the sticking by itself.
 */
function glyph(text: string, where: 'above' | 'below'): Annotation {
  return new Annotation(text)
    .setFont(Metrics.get('fontFamily'), Metrics.get('fontSize'))
    .setVerticalJustification(where === 'above' ? AnnotationVerticalJustify.TOP : AnnotationVerticalJustify.BOTTOM)
}

/**
 * Below the staff, under the feet's stems: a kick's stem ends 35 px below its head, and the sticking
 * sits under that. 30 px is the estimate until the gallery's worst-case row (Task 8) says otherwise.
 */
const HAIRPIN_Y_SHIFT = 30

function hairpin(from: StemmableNote, to: StemmableNote, kind: 'cresc' | 'dim'): StaveHairpin {
  // `StaveHairpin.type` is `{ CRESC: 1, DECRESC: 2 }` in stavehairpin.js; the literals stand in if the typings hide it.
  return new StaveHairpin(
    { firstNote: from, lastNote: to },
    kind === 'cresc' ? StaveHairpin.type.CRESC : StaveHairpin.type.DECRESC,
  ).setRenderOptions({
    height: 10,
    yShift: HAIRPIN_Y_SHIFT,
    leftShiftPx: 0,
    rightShiftPx: 0,
    leftShiftTicks: 0,
    rightShiftTicks: 0,
  })
}

export interface EngravedRow {
  el: SVGSVGElement
  dispose(): void
}

/**
 * One event as VexFlow holds it, with the box the time grid puts it in. `keyIndex` and `notes` let
 * `decorate` and `spanVoice` find which VexFlow key on a chord is which instrument (ties, and the
 * per-note modifiers: ghost, open/closed).
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

/** `part`, `index` and `flat` are read by `spanVoice`: the voice they belong to and its flat events find a tie or a hairpin's run start and end. */
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
  decorate(note, event, notes, dir, catalogue)
  return { note, keyIndex, notes }
}

/**
 * Everything that hangs on a sounding event. Order matters where modifiers stack in the same
 * direction: the sticking is added before the dynamic so the letter sits nearer the note and the
 * dynamic below it, as books print them.
 */
function decorate(note: StaveNote, event: Event, notes: Note[], dir: number, catalogue: Catalogue): void {
  notes.forEach((n, i) => {
    if (n.ghost) {
      note.addModifier(new Parenthesis(ModifierPosition.LEFT), i)
      note.addModifier(new Parenthesis(ModifierPosition.RIGHT), i)
    }
    // VexFlow 5 has no `ah` articulation: the open circle and the plus are the brass-mute glyphs, the ones MuseScore prints on a hi-hat.
    if (n.open) note.addModifier(glyph(Glyphs.brassMuteOpen, 'above'), i)
    if (n.closed) note.addModifier(glyph(Glyphs.brassMuteClosed, 'above'), i)
  })
  if (event.accent) note.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  if (event.sticking)
    note.addModifier(new Annotation(event.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (event.dynamic) note.addModifier(glyph(DYNAMIC_GLYPHS[event.dynamic], 'below'), 0)
  if (event.text)
    note.addModifier(new Annotation(event.text).setVerticalJustification(AnnotationVerticalJustify.TOP), 0)
  if (event.grace) {
    // The grace note takes the event's first instrument unless the piece says otherwise; a flam is one slashed eighth, a drag two beamed sixteenths.
    const instrument = event.grace.instrument ?? notes[0].instrument
    const key = keyForLine(catalogue[instrument].line, catalogue[instrument].head)
    const flam = event.grace.kind === 'flam'
    const graces = Array.from(
      { length: flam ? 1 : 2 },
      () => new GraceNote({ keys: [key], duration: flam ? '8' : '16', slash: flam, stemDirection: dir }),
    )
    note.addModifier(new GraceNoteGroup(graces, true).beamNotes(), 0)
  }
  if (event.roll?.kind === 'tremolo') note.addModifier(new Tremolo(event.roll.slashes), 0)
  if (event.roll?.kind === 'buzz') note.addModifier(new BuzzRoll(), 0)
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

export function voltaType(bracket: { first: boolean; last: boolean }): number {
  if (bracket.first && bracket.last) return VoltaType.BEGIN_END
  if (bracket.first) return VoltaType.BEGIN
  if (bracket.last) return VoltaType.END
  return VoltaType.MID
}

/**
 * VexFlow puts the metronome mark 20 px above the top line; −20 px lifts it clear of the bar number
 * that shares the row start. The estimate until the gallery's worst-case row (Task 8) says otherwise.
 */
const TEMPO_Y_SHIFT = -20

/** What a voice carries from one bar of the row to the next. Keyed `${part}/${voice}` in `engraveRow`. */
interface VoiceSpan {
  /** ties leaving the previous bar of this row: the note and the key index of each tied instrument */
  ties: { note: StaveNote; index: number; instrument: InstrumentId }[]
  /** a hairpin opened in this row (or arriving from the previous one) and not yet stopped */
  hairpin?: { note: StemmableNote; kind: 'cresc' | 'dim' }
  /** the voice's last note in this row so far: an open hairpin at the row end stops here */
  last?: StemmableNote
}

/** The instruments tied into the first event of bar `b` of a voice from the bar before it. At a row start they arrive as half ties. */
function tiedInto(score: Score, b: number, partId: string, voice: number): InstrumentId[] {
  const previous = score.bars[b - 1]?.parts?.[partId]?.voices[voice]
  if (!previous) return []
  const flat = flattenVoice(previous)
  const last = flat[flat.length - 1]?.event
  return (last?.notes ?? []).filter((n) => n.tie).map((n) => n.instrument)
}

/** Whether a hairpin is still open when bar `b` starts: the voice's last mark before it. Read from the score, never from the previous row's DOM. */
function hairpinInto(score: Score, b: number, partId: string, voice: number): 'cresc' | 'dim' | undefined {
  let open: 'cresc' | 'dim' | undefined
  for (let i = 0; i < b; i++) {
    const v = score.bars[i].parts?.[partId]?.voices[voice]
    if (!v) continue
    for (const f of flattenVoice(v)) {
      const h = f.event.hairpin
      if (h === 'stop') open = undefined
      else if (h) open = h
    }
  }
  return open
}

/**
 * The ties and hairpins of one voice in one bar, as elements to draw after the voice. A tie to the
 * next event stays in the bar; to the next bar it waits in `span` for that bar's first note, or —
 * on the row's last bar — is drawn as a half tie to the stave end. A hairpin runs from its start to
 * its stop, across bars; one still open at the row end stops at the voice's last note of the row,
 * and the next row picks it up from its first note (`StaveHairpin` needs both notes).
 */
function spanVoice(score: Score, row: RowLayout, bar: BarLayout, v: BuiltVoice, span: VoiceSpan): Element[] {
  const out: Element[] = []
  const first = bar === row.bars[0]
  const lastBar = bar === row.bars[row.bars.length - 1]
  const head = v.placed[0]
  if (first) {
    if (head?.note instanceof StaveNote) {
      for (const instrument of tiedInto(score, bar.barIndex, v.part.id, v.index)) {
        const k = head.keyIndex.get(instrument)
        if (k !== undefined) out.push(new StaveTie({ lastNote: head.note, lastIndexes: [k] }))
      }
    }
    const open = head && hairpinInto(score, bar.barIndex, v.part.id, v.index)
    if (open && head) span.hairpin = { note: head.note, kind: open }
  } else if (head?.note instanceof StaveNote) {
    for (const t of span.ties) {
      const k = head.keyIndex.get(t.instrument)
      if (k !== undefined)
        out.push(new StaveTie({ firstNote: t.note, lastNote: head.note, firstIndexes: [t.index], lastIndexes: [k] }))
    }
  }
  span.ties = []
  v.placed.forEach((p, i) => {
    const event = v.flat[i].event
    if (p.note instanceof StaveNote) {
      for (const n of p.notes) {
        if (!n.tie) continue
        const k = p.keyIndex.get(n.instrument) as number
        const next = v.placed[i + 1]
        if (next) {
          const kn = next.keyIndex.get(n.instrument)
          if (kn !== undefined && next.note instanceof StaveNote)
            out.push(new StaveTie({ firstNote: p.note, lastNote: next.note, firstIndexes: [k], lastIndexes: [kn] }))
        } else if (lastBar) out.push(new StaveTie({ firstNote: p.note, firstIndexes: [k] }))
        else span.ties.push({ note: p.note, index: k, instrument: n.instrument })
      }
    }
    if (event.hairpin === 'cresc' || event.hairpin === 'dim') span.hairpin = { note: p.note, kind: event.hairpin }
    else if (event.hairpin === 'stop' && span.hairpin) {
      out.push(hairpin(span.hairpin.note, p.note, span.hairpin.kind))
      span.hairpin = undefined
    }
    span.last = p.note
  })
  if (lastBar && span.hairpin && span.last && span.hairpin.note !== span.last) {
    out.push(hairpin(span.hairpin.note, span.last, span.hairpin.kind))
    span.hairpin = undefined
  }
  return out
}

function engraveBar(
  ctx: RenderContext,
  score: Score,
  catalogue: Catalogue,
  layout: Layout,
  row: RowLayout,
  bar: BarLayout,
  meters: Meter[],
  spans: Map<string, VoiceSpan>,
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
  if (written.repeat?.start) stave.setBegBarType(BarlineType.REPEAT_BEGIN)
  if (written.repeat?.end) stave.setEndBarType(BarlineType.REPEAT_END)
  else if (bar.barIndex === score.bars.length - 1) stave.setEndBarType(BarlineType.END)
  // "1." / "1. 2." at the bracket start; VexFlow draws the line to the bar's end and the hook where the bracket closes.
  if (bar.bracket) stave.setVoltaType(voltaType(bar.bracket), bar.bracket.numbers.map((n) => `${n}.`).join(' '), 0)
  if (written.tempo)
    stave.setTempo(
      { bpm: written.tempo.bpm, duration: String(written.tempo.unit ?? 4), dots: written.tempo.dotted ? 1 : 0 },
      TEMPO_Y_SHIFT,
    )
  stave.setContext(ctx).draw()
  // Only at the start of the row: with twenty identical repeats it is the only thing that says WHERE
  // you are. Above the staff, not to the left — the left has the clef. Written bar numbers, 1-based.
  if (bar.showClef) label(ctx, stave, String(bar.barIndex + 1), 0)
  // A repeat played more than twice: the sign cannot say it, the text above its end barline does.
  const times = written.repeat?.end?.times ?? 0
  // 24 px: the width of "×3" in 13 px system-ui (measured ≈20 px) plus 4 px of air before the barline.
  if (times > 2) label(ctx, stave, `×${times}`, bar.x + bar.width - 24)
  if (written.simile) {
    // One "%" centred on the bar: a note in a voice that asks for no time (SOFT), whose tick context
    // is then put at the bar's centre by hand — the grid has nothing to say about a bar that repeats another.
    const sign = new RepeatNote('1')
    const vf = new Voice({ numBeats: meter[0], beatValue: meter[1] }).setMode(VoiceMode.SOFT).addTickables([sign])
    vf.setStave(stave)
    sign.setStave(stave)
    const formatter = new Formatter().joinVoices([vf])
    formatter.formatToStave([vf], stave)
    const tc = sign.getTickContext()
    tc.setX(tc.getX() + (bar.x + bar.width / 2 - sign.getAbsoluteX()))
    vf.draw(ctx, stave)
    return
  }

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
  // Spans are drawn after the voices so they sit over the noteheads, not under them.
  const spanned = voices.flatMap((v) => {
    const key = `${v.part.id}/${v.index}`
    let span = spans.get(key)
    if (!span) {
      span = { ties: [] }
      spans.set(key, span)
    }
    return spanVoice(score, row, bar, v, span)
  })
  for (const v of voices) v.vf.draw(ctx, stave)
  for (const v of voices) {
    for (const b of v.beams) b.setContext(ctx).draw()
    for (const t of v.tuplets) t.setContext(ctx).draw()
  }
  for (const s of spanned) s.setContext(ctx).draw()
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
  const spans = new Map<string, VoiceSpan>()
  for (const bar of row.bars) engraveBar(ctx, score, catalogue, layout, row, bar, meters, spans)
  const el = mount.querySelector('svg') as SVGSVGElement
  el.style.position = 'absolute'
  el.style.left = '0'
  el.style.top = `${row.index * height}px`
  host.appendChild(el)
  return { el, dispose: () => el.remove() }
}

/**
 * Natural px from a stave's left edge to where its notes may start, for the given head: what
 * `HEAD_PX` (clef + meter) and `METER_PX` (meter alone) must cover, plus VexFlow's note padding.
 * A dev measurement for the gallery; nothing in the app calls it. Needs the fonts: the clef and
 * the signature are glyphs.
 */
export function measureHead(clef: boolean, meter: string | null): number {
  const stave = new Stave(0, 0, 400)
  if (clef) stave.addClef('percussion')
  if (meter) stave.addTimeSignature(meter)
  return stave.getNoteStartX() + Metrics.get('Stave.padding', 0)
}

/**
 * Ink extent of one row in natural px, read from pixels: the row is drawn on an offscreen canvas
 * (VexFlow's canvas backend, through the same `engraveBar`) with room above and below the band,
 * and the first and last painted pixel rows are read back. `getBBox()` cannot give this: VexFlow 5
 * draws every glyph as text, and a text box is the font's em box — measured ≈80 px deeper than a
 * dynamic's ink. A dev measurement for the gallery; nothing in the app calls it.
 */
export function measureInk(
  score: Score,
  catalogue: Catalogue,
  layout: Layout,
  row: RowLayout,
): { top: number; bottom: number } {
  const PAD = 200
  const canvas = document.createElement('canvas')
  const renderer = new Renderer(canvas, RendererBackends.CANVAS)
  const width = Math.ceil(row.widthNatural)
  const height = SYSTEM_H + 2 * PAD
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  const c2d = canvas.getContext('2d') as CanvasRenderingContext2D
  // After `resize`, which applied the device pixel ratio: the shift is in natural px.
  c2d.translate(0, PAD)
  const meters = metersOf(score)
  const spans = new Map<string, VoiceSpan>()
  for (const bar of row.bars) engraveBar(ctx, score, catalogue, layout, row, bar, meters, spans)
  const dpr = window.devicePixelRatio || 1
  const image = c2d.getImageData(0, 0, canvas.width, canvas.height)
  let top = -1
  let bottom = -1
  for (let y = 0; y < image.height; y++) {
    let painted = false
    for (let x = 0; x < image.width && !painted; x++) painted = image.data[(y * image.width + x) * 4 + 3] > 0
    if (painted) {
      if (top < 0) top = y
      bottom = y + 1
    }
  }
  return { top: top / dpr - PAD, bottom: bottom / dpr - PAD }
}
