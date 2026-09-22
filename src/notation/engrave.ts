import {
  Annotation,
  AnnotationVerticalJustify,
  Articulation,
  BarlineType,
  Beam,
  Dot,
  type Element,
  Formatter,
  GraceNote,
  GraceNoteGroup,
  Metrics,
  ModifierPosition,
  type RenderContext,
  Renderer,
  RendererBackends,
  type Stave,
  StaveNote,
  StaveTie,
  Stem,
  Tremolo,
  Tuplet,
  Voice,
  VoiceMode,
} from 'vexflow/bravura'
import { resolveBeams } from '../score/beaming'
import { type FlatEvent, flattenBar, metersOf } from '../score/events'
import { type EventId, keyOf } from '../score/ids'
import type { Bar, Event, Meter, Score } from '../score/types'
import { BuzzRoll } from './buzz-roll'
import {
  BARLINE_OVERHANG,
  type BarLayout,
  type EventBox,
  type Layout,
  LINE_PX,
  type RowLayout,
  restLine,
  SNARE_LINE,
  STAFF_H,
  STAFF_LINES,
  STAFF_TOP,
  SYSTEM_H,
} from './layout'
import { AlignedStave, anchorStems, keepRestsOnTheirLines } from './vexflow-fixes'

const NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

/**
 * Staff line → VexFlow key. The percussion clef uses the treble map: line 0, the bottom line, is
 * e/4 and every half line is one name up, so the snare on line 2.5 is c/5 — the third space.
 */
export function keyForLine(line: number): string {
  const step = Math.round(line * 2) + 2 // e is the third name of octave 4
  const name = NAMES[((step % 7) + 7) % 7]
  const octave = 4 + Math.floor(step / 7)
  return `${name}/${octave}`
}

/** Every stroke on the snare's line, every rest on its rest line: one staff, one voice, stems up. */
const SNARE_KEY = keyForLine(SNARE_LINE)

export interface EngravedRow {
  el: SVGSVGElement
  dispose(): void
}

/** One event as VexFlow holds it, with the box the time grid puts it in. */
interface Placed {
  note: StaveNote
  /** always found — the layout builds one box per written event; the guard keeps `placeOnGrid` from throwing on a hand-built score */
  box: EventBox | undefined
}

/** `flat` is read by `spanBar`: the events behind `placed` find a tie's start. */
interface BuiltBar {
  flat: FlatEvent[]
  placed: Placed[]
  vf: Voice
  beams: Beam[]
  tuplets: Tuplet[]
}

/**
 * Everything that hangs on an event. Order matters where modifiers stack in the same direction:
 * the accent is added before the text so the text sits above the accent; the sticking is the only
 * thing below the staff. A rest carries at most a text (validation keeps the rest of the list off it).
 */
function decorate(note: StaveNote, event: Event): void {
  if (event.accent) note.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  // Below the staff, where the pad books print it.
  if (event.sticking)
    note.addModifier(new Annotation(event.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (event.text)
    note.addModifier(new Annotation(event.text).setVerticalJustification(AnnotationVerticalJustify.TOP), 0)
  if (event.grace) {
    // A flam is one slashed eighth, a drag two beamed sixteenths, on the snare's line before the note, stem up.
    const flam = event.grace.kind === 'flam'
    const graces = Array.from(
      { length: flam ? 1 : 2 },
      () => new GraceNote({ keys: [SNARE_KEY], duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }),
    )
    note.addModifier(new GraceNoteGroup(graces, true).beamNotes(), 0)
  }
  if (event.roll?.kind === 'tremolo') note.addModifier(new Tremolo(event.roll.slashes), 0)
  if (event.roll?.kind === 'buzz') note.addModifier(new BuzzRoll(), 0)
}

function buildNote(event: Event): StaveNote {
  const dots = event.duration.dots ?? 0
  const duration = String(event.duration.base)
  const note = event.rest
    ? new StaveNote({
        keys: [keyForLine(restLine(event.duration.base))],
        duration,
        dots,
        type: 'r',
        stemDirection: Stem.UP,
      })
    : new StaveNote({ keys: [SNARE_KEY], duration, dots, stemDirection: Stem.UP })
  // One `buildAndAttach` call draws one dot: the struct's `dots` only set the ticks, so a double dot needs two calls.
  for (let i = 0; i < dots; i++) Dot.buildAndAttach([note], { all: true })
  decorate(note, event)
  return note
}

function buildBar(layout: Layout, bar: BarLayout, meter: Meter, written: Bar): BuiltBar {
  const flat = flattenBar(written)
  const placed: Placed[] = flat.map((f) => {
    const id: EventId = { bar: bar.barIndex, item: f.item }
    if (f.sub !== undefined) id.sub = f.sub
    return { note: buildNote(f.event), box: layout.boxes.get(keyOf(id)) }
  })
  // SOFT: a bar that overflows or underfills its meter (validation reports it) still draws instead of throwing.
  const vf = new Voice({ numBeats: meter[0], beatValue: meter[1] })
    .setMode(VoiceMode.SOFT)
    .addTickables(placed.map((p) => p.note))

  // A tuplet is its consecutive flat events, whatever they draw.
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
          location: Tuplet.LOCATION_TOP,
        },
      ),
    )
    i = j
  }

  // Beams from the marks: a run from `begin` to `end`.
  const marks = resolveBeams(meter, written.beams, flat)
  const beams: Beam[] = []
  let run: StaveNote[] = []
  marks.forEach((mark, i) => {
    if (mark === null) return
    run.push(placed[i].note)
    if (mark === 'end') {
      beams.push(new Beam(run, false))
      run = []
    }
  })
  return { flat, placed, vf, beams, tuplets }
}

/**
 * Rewrites the x of every tick context onto the time grid. The formatter has done its job — stems,
 * beams, modifier widths — and that stays; only WHERE each instant lands moves, because typographic
 * spacing gives four sixteenths 2.6 times the width of the quarter they last (measured on the old
 * renderer: 157 px/s against a cursor at 60 px/s), and a cursor gliding over that tells the eye a
 * speed that does not exist.
 *
 * The tick context moves, not the note: beams, tuplets, ties and modifiers read the position at
 * draw time and follow. With one voice there is one tickable per context, and it is the anchor:
 * its notehead's left edge goes to its box's x (a delta, not an absolute: the offset between the
 * context's x and the notehead — displacement, stem width — need not be known).
 */
function placeOnGrid(formatter: Formatter, built: BuiltBar): void {
  const boxOf = new Map<StaveNote, EventBox>()
  for (const p of built.placed) if (p.box) boxOf.set(p.note, p.box)
  for (const tc of formatter.getTickContexts()?.array ?? []) {
    const anchor = tc.getTickables().find((t) => t instanceof StaveNote) as StaveNote | undefined
    const box = anchor && boxOf.get(anchor)
    if (!anchor || !box) continue
    tc.setX(tc.getX() + (box.x - anchor.getNoteHeadBeginX()))
  }
}

/**
 * Small grey text in the band above the staff, 8 px above the top line: bar numbers and the "×N" of
 * a repeat played more than twice. `x` is where the text is anchored, as CSS `text-align` would:
 * `start` puts its left edge there and a longer text grows rightwards, `end` puts its right edge
 * there and it grows leftwards — so a label on a row's edge never leaves the row, whatever it says.
 * The width comes from the context's own `measureText` in the label's font, so the SVG the app
 * draws and the canvas `measureInk` reads agree.
 */
function label(ctx: RenderContext, stave: Stave, text: string, x: number, align: 'start' | 'end'): void {
  ctx.save()
  ctx.setFont('system-ui, sans-serif', 13)
  ctx.setFillStyle('#888')
  const left = align === 'start' ? x : x - ctx.measureText(text).width
  ctx.fillText(text, left, stave.getYForLine(0) - 8)
  ctx.restore()
}

/** What a row carries from one bar to the next: the note of a tie leaving the previous bar, waiting for this bar's first note. */
interface BarSpan {
  tie?: StaveNote
}

/** Whether the previous written bar's last event is tied into bar `b`: at a row start the tie arrives as a half tie. */
function tiedInto(score: Score, b: number): boolean {
  if (b === 0) return false
  const flat = flattenBar(score.bars[b - 1])
  return flat[flat.length - 1]?.event.tie === true
}

/**
 * The ties of one bar, as elements to draw after the notes. A tie to the next event stays in the
 * bar; to the next bar it waits in `span` for that bar's first note, or — on the row's last bar —
 * is drawn as a half tie to the stave end; on the row's first bar a tie from the previous row
 * enters as a half tie into the first note. Read from the score, never from the previous row's DOM.
 */
function spanBar(
  score: Score,
  bar: BarLayout,
  built: BuiltBar,
  span: BarSpan,
  first: boolean,
  lastBar: boolean,
): Element[] {
  const out: Element[] = []
  const head = built.placed[0]?.note
  if (head) {
    if (first) {
      if (tiedInto(score, bar.barIndex)) out.push(new StaveTie({ lastNote: head }))
    } else if (span.tie) out.push(new StaveTie({ firstNote: span.tie, lastNote: head }))
  }
  span.tie = undefined
  built.placed.forEach((p, i) => {
    if (!built.flat[i].event.tie) return
    const next = built.placed[i + 1]
    if (next) out.push(new StaveTie({ firstNote: p.note, lastNote: next.note }))
    else if (lastBar) out.push(new StaveTie({ firstNote: p.note }))
    else span.tie = p.note
  })
  return out
}

function engraveBar(
  ctx: RenderContext,
  score: Score,
  layout: Layout,
  row: RowLayout,
  bar: BarLayout,
  meters: Meter[],
  span: BarSpan,
): void {
  const written = score.bars[bar.barIndex]
  const meter = meters[bar.barIndex]
  // `spaceAboveStaffLn` is in line spaces: it is what VexFlow reads to place the first line inside
  // the band, so it must move with STAFF_TOP — the band is the layout's, the staff's place in it is VexFlow's.
  const stave = new AlignedStave(bar.x - bar.head, 0, bar.head + bar.width, {
    numLines: STAFF_LINES,
    spaceAboveStaffLn: STAFF_TOP / LINE_PX,
    spaceBelowStaffLn: (SYSTEM_H - STAFF_TOP - STAFF_H) / LINE_PX,
  })
  if (bar.showClef) stave.addClef('percussion')
  if (bar.showMeter) stave.addTimeSignature(`${meter[0]}/${meter[1]}`)
  if (written.repeat?.start) stave.setBegBarType(BarlineType.REPEAT_BEGIN)
  if (written.repeat?.end) stave.setEndBarType(BarlineType.REPEAT_END)
  else if (bar.barIndex === score.bars.length - 1) stave.setEndBarType(BarlineType.END)
  stave.setContext(ctx).draw()
  // Only at the start of the row: with twenty identical repeats it is the only thing that says WHERE
  // you are. Above the staff, not to the left — the left has the clef — and starting where the
  // stave starts, the row's left edge. Written bar numbers, 1-based.
  if (bar.showClef) label(ctx, stave, String(bar.barIndex + 1), stave.getX(), 'start')
  // A repeat played more than twice: the sign cannot say it, the text above its end barline does,
  // ending where the barline's ink ends — the row's right edge when the repeat closes the row.
  const times = written.repeat?.end?.times ?? 0
  if (times > 2) label(ctx, stave, `×${times}`, bar.x + bar.width + BARLINE_OVERHANG, 'end')

  const built = buildBar(layout, bar, meter, written)
  // Validation refuses an empty bar; the guard keeps VexFlow's formatter from throwing on a hand-built one.
  if (built.placed.length === 0) return
  // The stave must be on the notes BEFORE they are measured: `formatToStave` uses it for the width
  // but does not attach it, and until they have it `getNoteHeadBeginX()` answers without the
  // start-of-notes offset — a constant error per bar (measured on the old renderer: +66.1 px on
  // the first bar, +279 on the second), i.e. the right grid in the wrong place.
  built.vf.setStave(stave)
  for (const p of built.placed) p.note.setStave(stave)
  // Formatted and drawn in two passes, not `Formatter.FormatAndDraw`: the grid runs between the two.
  const formatter = new Formatter().joinVoices([built.vf])
  formatter.formatToStave([built.vf], stave)
  // Formatting moved the beamed rests, the tuplets moved theirs: back where the score writes them.
  keepRestsOnTheirLines(built.placed.map((p) => p.note))
  placeOnGrid(formatter, built)
  const first = row.bars[0] === bar
  const lastBar = row.bars[row.bars.length - 1] === bar
  // Ties are drawn after the notes so they sit over the noteheads, not under them.
  const spanned = spanBar(score, bar, built, span, first, lastBar)
  // Last, just before any stem is drawn — the voice draws the free ones, the beams the rest.
  for (const p of built.placed) anchorStems(p.note)
  built.vf.draw(ctx, stave)
  for (const b of built.beams) b.setContext(ctx).draw()
  for (const t of built.tuplets) t.setContext(ctx).draw()
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
  const span: BarSpan = {}
  for (const bar of row.bars) engraveBar(ctx, score, layout, row, bar, meters, span)
  const el = mount.querySelector('svg')
  if (!el) throw new Error('VexFlow rendered no <svg>')
  el.style.position = 'absolute'
  el.style.left = '0'
  el.style.top = `${row.index * height}px`
  host.appendChild(el)
  return { el, dispose: () => el.remove() }
}

/** VexFlow's own air between a stave's start and its first note, natural px: what `BAR_PAD` restates. A dev measurement for the gallery. */
export function measurePad(): number {
  return Metrics.get('Stave.padding', 0)
}

/**
 * Natural px from a stave's left edge to where its notes may start, for the given head: what
 * `HEAD_PX` (clef + meter) and `METER_PX` (meter alone) must cover, plus VexFlow's note padding.
 * A dev measurement for the gallery; nothing in the app calls it. Needs the fonts: the clef and
 * the signature are glyphs.
 */
export function measureHead(clef: boolean, meter: string | null): number {
  const stave = new AlignedStave(0, 0, 400)
  if (clef) stave.addClef('percussion')
  if (meter) stave.addTimeSignature(meter)
  return stave.getNoteStartX() + Metrics.get('Stave.padding', 0)
}

/**
 * Ink extent of one row in natural px, read from pixels: the row is drawn on an offscreen canvas
 * (VexFlow's canvas backend, through the same `engraveBar`) with room on every side of the row's
 * box, so ink that would leave it is seen instead of clipped, and the first and last painted pixel
 * rows and columns are read back — the rows inside `xRange` (natural px) when given, so the cursor
 * probe can leave the clef and the bar number out. `top`/`bottom` are against the band [0,
 * SYSTEM_H], `left`/`right` against the row's width [0, widthNatural]. `getBBox()` cannot give
 * this: VexFlow 5 draws every glyph as text, and a text box is the font's em box — measured ≈80 px
 * deeper than the ink. A dev measurement for the gallery; nothing in the app calls it.
 */
export function measureInk(
  score: Score,
  layout: Layout,
  row: RowLayout,
  xRange?: [number, number],
): { top: number; bottom: number; left: number; right: number } {
  const PAD = 200
  const canvas = document.createElement('canvas')
  const renderer = new Renderer(canvas, RendererBackends.CANVAS)
  const width = Math.ceil(row.widthNatural) + 2 * PAD
  const height = SYSTEM_H + 2 * PAD
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  const c2d = canvas.getContext('2d') as CanvasRenderingContext2D
  // After `resize`, which applied the device pixel ratio: the shift is in natural px.
  c2d.translate(PAD, PAD)
  const meters = metersOf(score)
  const span: BarSpan = {}
  for (const bar of row.bars) engraveBar(ctx, score, layout, row, bar, meters, span)
  const dpr = window.devicePixelRatio || 1
  const image = c2d.getImageData(0, 0, canvas.width, canvas.height)
  const x0 = xRange ? Math.max(0, Math.floor((xRange[0] + PAD) * dpr)) : 0
  const x1 = xRange ? Math.min(image.width, Math.ceil((xRange[1] + PAD) * dpr)) : image.width
  let top = -1
  let bottom = -1
  let left = image.width
  let right = -1
  // One pass over the alpha channel: the vertical extent inside `xRange`, the horizontal one over
  // every column — it is the whole row's.
  for (let y = 0, i = 3; y < image.height; y++) {
    for (let x = 0; x < image.width; x++, i += 4) {
      if (image.data[i] === 0) continue
      if (x < left) left = x
      if (x > right) right = x
      if (x >= x0 && x < x1) {
        if (top < 0) top = y
        bottom = y + 1
      }
    }
  }
  return { top: top / dpr - PAD, bottom: bottom / dpr - PAD, left: left / dpr - PAD, right: (right + 1) / dpr - PAD }
}
