import {
  BarlineType,
  type Beam,
  Formatter,
  Renderer,
  RendererBackends,
  Stave,
  type StaveNote,
  type Tuplet,
  Voice,
  VoiceMode,
} from 'vexflow/bravura'
import { buildBar, KEY_5_LINE } from './build'
import type { BarPlan } from './plan'

/** Natural geometry: the music is always drawn at this size, then scaled all together. */
const NATURAL_BEAT_PX = 96
const NATURAL_HEAD_PX = 70
const NATURAL_SYSTEM_H = 140
/**
 * Five-line staff. VexFlow keeps 10px between one line and the next, so the staff is 40px tall;
 * above it 70px remain for stems, beams, accents and tuplet numbers, below it 30px for the R/L
 * sticking. Sums to 140.
 *
 * The 70px above are measured on the worst case, not chosen: a triplet's number is positioned
 * ABOVE the accent (verified — with the accent removed, VexFlow lowers it back by 22.5px), and a
 * triplet plus an accent on the first hit is the double paradiddle, i.e. business as usual among
 * rudiments. With the previous 40px that number ended up 22px outside the band, i.e. above the
 * sticking of the PREVIOUS row. The cost is a row 27% taller even where there are no triplets: the
 * band is a constant, it is not measured per exercise.
 *
 * `NATURAL_STAFF_TOP` and `NATURAL_STAFF_H` are exported because the cursor does not live in the
 * SVG (it is a sibling div, see `Score`): to cover the staff and not the whole band of the row it
 * needs to know where the staff starts and how tall it is.
 */
const STAFF_LINES = 5
export const NATURAL_STAFF_TOP = 70
export const NATURAL_STAFF_H = (STAFF_LINES - 1) * 10
/** Notehead at natural scale: needed to know when zoom makes it unreadable. */
export const NATURAL_NOTEHEAD_PX = 11.8
/** Below this size the notehead is no longer readable: it is the constraint that limits density. */
export const MIN_NOTEHEAD_PX = 8
/**
 * Margin to the right of the row's last bar. Without it, the end-of-bar barline lands at
 * `x = width` — i.e. exactly on the SVG's edge — and gets clipped: the row shows only the middle
 * barline and looks like it trails off into nothing. Eight pixels are enough even for the final
 * barline, which is thick.
 */
const NATURAL_RIGHT_PAD = 8
/**
 * Gutter to the left of the grid, when the exercise has grace notes. A flam or a drag is drawn
 * BEFORE its note, and nothing reserves that space for it on the time grid: the note sits at its
 * instant, period. On the row's first beat the grace note would therefore end up over the clef and
 * time signature (measured: it takes up 23.7px to the left of the notehead).
 *
 * It is a translation of the whole grid, not a local exception: it moves the origin, not the steps,
 * and the cursor stays at constant speed. It is paid only where it is needed — an exercise without
 * grace notes does not lose a pixel — because 24px less music per row, in 2/4 on a phone, are worth
 * one bar per row instead of two.
 */
const NATURAL_GRACE_PX = 24

export interface RenderOptions {
  /** e.g. "2/4" */
  timeSignature: string
  beatsPerBar: number
  /** bars in ONE repeat: the row anchors to this musical unit */
  barsPerRepeat: number
  /** bars in the whole piece: the row is never longer than the music there is */
  totalBars: number
  /** usable width in px: bars per row and scale are derived from this */
  availW: number
}

export interface Fit {
  barsPerRow: number
  scale: number
  systemH: number
}

export interface RenderedNote {
  note: StaveNote
  /** x of the notehead's LEFT EDGE in screen px (already multiplied by `scale`) */
  x: number
  /** index of the row the note sits on */
  row: number
}

export interface RenderedScore {
  width: number
  height: number
  rows: number
  fit: Fit
  /**
   * Screen x where the row's time grid ends, i.e. where the next note would land if the row kept
   * going. The cursor slides over it during the row wrap, and since it is the right point on the
   * time axis it does so at the exact same speed as the rest: the row ends without the cursor
   * changing pace. It is the end-of-row barline, `NATURAL_RIGHT_PAD` excluded.
   */
  rowEndX: number
  /** slotIndex → note, screen x and row */
  notes: Map<number, RenderedNote>
  /**
   * Beams and tuplets of every bar, in drawing order. The colour lives on the note (`notes`), not
   * here: these two arrays exist only because colouring via `getSVGElement()` does not reach the
   * SVG group of `Beam`/`Tuplet` (it is a sibling, not a child, of the note's) — a future task that
   * needed to act on beams or brackets already has the object at hand, without redoing the
   * `buildBar` pass.
   */
  beams: Beam[]
  tuplets: Tuplet[]
}

/**
 * Resolves when the fonts are ready in the document (including VexFlow's Bravura music font).
 * It does not keep a reference to `document.fonts`' `FontFaceSet`: the promise resolved to `void`
 * is enough for the caller, which only needs to know *when*, not *what*.
 */
export function notationFontsReady(): Promise<void> {
  return document.fonts.ready.then(() => undefined)
}

/**
 * From the available space, works out how many bars fit on a row and at what scale.
 * No manual control: if the screen is narrow, bars per row drop on their own.
 *
 * The rule, in one line: **fill the width, unless a shorter row already fills it to within a 10%
 * gap — in that case keep the notes large.**
 *
 * `MIN_NOTEHEAD_PX` is a FLOOR, not a target: packing up to the readability limit spends the whole
 * budget every time, and there is almost always a shorter row that covers the same width with much
 * bigger noteheads. At an 847px viewport, 6 bars in 2/4 drop to an 8.1px notehead while 4 take up
 * 846 out of 847 — i.e. they fill the screen — at the full size of 11.8px.
 */
export function fitLayout(
  availW: number,
  barsPerRepeat: number,
  beatsPerBar: number,
  totalBars: number,
  leftGutter = 0,
): Fit {
  // `barsPerRepeat` at 0 (degenerate exercise, unpopulated field) would give `n % 0` and divisions
  // by zero: NaN that silently reaches `renderer.resize(NaN, NaN)` and a Stave with y NaN, i.e. a
  // blank box with not a single line in the console. Better a wrong row than no drawing at all.
  const atLeastOneBar = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1)
  const repeat = atLeastOneBar(barsPerRepeat)
  const total = atLeastOneBar(totalBars)
  // Same gate, third parameter: a non-finite `availW` would come out as a NaN scale and height even
  // with the other two sane. Today it always comes from `clientWidth`, which is a number; the guard
  // is here because the function is exported, not because today's caller needs it.
  const width = Number.isFinite(availW) ? Math.max(0, availW) : 0
  const naturalBar = beatsPerBar * NATURAL_BEAT_PX
  const fixed = NATURAL_HEAD_PX + Math.max(0, leftGutter) + NATURAL_RIGHT_PAD
  /** Width that `n` bars take up at natural size, clef and right margin included. */
  const naturalW = (n: number) => n * naturalBar + fixed

  // Candidates: only rows that stay a MUSICAL unit — the divisors of the repeat (half a repeat per
  // row, a quarter…) and its multiples (one per row, two, three…). Truncated to the piece: a row
  // longer than the music would leave empty staff to the right and, worse, would shrink the scale
  // to make room for bars that do not exist.
  //
  // Known and accepted limit: with `barsPerRepeat` prime and > 2 (7, 11) the only candidate under
  // the repeat is 1, so on a narrow screen it drops to one bar per row even where 3 would fit. The
  // library does not produce that case (the exercises have 1 or 2 bars per repeat) and splitting
  // the pattern mid-repeat would cost the reader more than it is worth.
  const candidates: number[] = []
  for (let d = 1; d <= repeat && d <= total; d++) if (repeat % d === 0) candidates.push(d)
  for (let m = 2 * repeat; m <= total; m += repeat) candidates.push(m)

  // `naturalW` is increasing in n and the candidates are sorted: the largest that fits and the
  // smallest that overflows are found in one pass.
  let nFit = 0
  let nOver = 0
  for (const n of candidates) {
    if (naturalW(n) <= width) nFit = n
    else if (nOver === 0) nOver = n
  }

  // First the row that already fills up at full size (gap under 10%), then the one that fills by
  // shrinking but stays readable, then the full-size one anyway even if it leaves space.
  let barsPerRow: number
  if (nFit !== 0 && width - naturalW(nFit) <= 0.1 * width) barsPerRow = nFit
  else if (nOver !== 0 && NATURAL_NOTEHEAD_PX * (width / naturalW(nOver)) >= MIN_NOTEHEAD_PX) barsPerRow = nOver
  else if (nFit !== 0) barsPerRow = nFit
  // Not even one bar fits at the minimum readable size: the shortest possible row is shown anyway,
  // shrunk past the floor. One unreadable bar is better than zero bars.
  else barsPerRow = candidates[0]

  // The scale never goes above natural: on a wide screen the music would go huge, it is not more
  // readable, it is only big.
  const scale = Math.min(1, width / naturalW(barsPerRow))
  return { barsPerRow, scale, systemH: NATURAL_SYSTEM_H * scale }
}

/**
 * Draws the bars in a single SVG inside `host` (emptied first), wrapping every `fit.barsPerRow`
 * bars. Colour is later applied to the DOM (notation/paint) and scrolling is `scrollTop` on the
 * viewport: neither of the two goes through here.
 *
 * It only redraws when the space (or the exercise) changes: the layout is computed once and etched
 * into the SVG, so the caller must redraw when `availW` changes.
 *
 * Do not call before `notationFontsReady()` has resolved: VexFlow measures glyph widths by reading
 * the DOM, so a render done before the music font is applied computes wrong x coordinates that then
 * stay etched in the SVG forever, because this function never re-lays-out.
 */
/**
 * Rewrites the x of every note in the bar onto the **time grid**: the row is a time axis, and the x
 * of a note is its instant multiplied by `NATURAL_BEAT_PX`.
 *
 * VexFlow's formatter has already done its job by the time this runs — stems, beams, modifier
 * direction, minimum widths — and that stays. Here only WHERE each note lands is moved, because the
 * formatter spaces things typographically: it gives four sixteenths 2.6 times the width of a
 * quarter note that lasts the same time (measured: 157 px/s against a cursor at 60 px/s). With a
 * scrolling cursor, that spacing tells the eye a speed that does not exist. On the grid the cursor
 * moves at constant pace, and rests end up in the right place on their own, with no need to anchor
 * them.
 *
 * The TickContext is moved, not the note: beams, triplets, accents and sticking read the position at
 * draw time, so they follow without having to be touched. This holds as long as every note has its
 * own TickContext — one voice per bar, as it is here: two notes sharing one would move twice.
 */
function placeOnTimeGrid(bar: BarPlan, notes: StaveNote[], barGridX: number): void {
  let k = 0
  bar.beats.forEach((beat, b) => {
    const n = beat.notes.length
    beat.notes.forEach((_, i) => {
      const note = notes[k++]
      const target = barGridX + (b + i / n) * NATURAL_BEAT_PX
      const tc = note.checkTickContext()
      // Delta and not an absolute value: between the TickContext's x and the notehead's left edge
      // there is an offset (notehead displacement, stem width) that does not need to be known to shift it.
      tc.setX(tc.getX() + (target - note.getNoteHeadBeginX()))
    })
  })
}

export function renderScore(host: HTMLDivElement, bars: BarPlan[], opts: RenderOptions): RenderedScore {
  const grace = bars.some((b) => b.beats.some((bt) => bt.notes.some((n) => n.grace.length > 0))) ? NATURAL_GRACE_PX : 0
  const fit = fitLayout(opts.availW, opts.barsPerRepeat, opts.beatsPerBar, opts.totalBars, grace)
  host.innerHTML = ''
  const naturalBar = opts.beatsPerBar * NATURAL_BEAT_PX
  /** Origin of the time grid: where the first note of every row lands. */
  const gridX0 = NATURAL_HEAD_PX + grace
  const rows = Math.ceil(bars.length / fit.barsPerRow)
  const width = fit.scale * (fit.barsPerRow * naturalBar + gridX0 + NATURAL_RIGHT_PAD)
  const height = rows * fit.systemH

  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  // A single scale over the whole context: note, spacing and row height always keep the same
  // ratio. Widening only the bars would change the distances but not the glyphs, which VexFlow
  // draws at a fixed size, and on tightly packed rows the noteheads would end up on top of each other.
  ctx.scale(fit.scale, fit.scale)
  const notes = new Map<number, RenderedNote>()
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []

  bars.forEach((bar, i) => {
    const row = Math.floor(i / fit.barsPerRow)
    const col = i % fit.barsPerRow
    const first = col === 0
    const x = first ? 0 : gridX0 + col * naturalBar
    const w = naturalBar + (first ? gridX0 : 0)
    // `spaceAboveStaffLn` is in 10px line spaces: 7 = the 70px of `NATURAL_STAFF_TOP`, and they must
    // move together — it is VexFlow that decides from this where the first line falls inside the band.
    const stave = new Stave(x, row * NATURAL_SYSTEM_H, w, {
      numLines: STAFF_LINES,
      spaceAboveStaffLn: 7,
      spaceBelowStaffLn: 3,
    })
    if (first) stave.addClef('percussion')
    // The time signature is written once, at the start of the piece: repeating it on every row is
    // noise, and in 2/4 on a narrow row it is noise that costs an eighth of the usable width.
    if (row === 0 && col === 0) stave.addTimeSignature(opts.timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    // Bar number only at the start of the row: with 20 identical repeats it is the only reference
    // that tells you WHERE you are in the piece. Above the staff, not to the left: the left already
    // has the clef and time signature.
    if (first) {
      ctx.save()
      ctx.setFont('system-ui, sans-serif', 13)
      ctx.setFillStyle('#888')
      ctx.fillText(String(i + 1), 0, stave.getYForLine(0) - 8)
      ctx.restore()
    }
    const built = buildBar(bar, KEY_5_LINE)
    // Formatted and drawn in two passes (instead of `Formatter.FormatAndDraw`, which does both in
    // one) because the grid runs between the two. `SOFT`: triplets only add up correctly once
    // `Tuplet` has corrected the ticks, and a drawing should not fail over a tenth of a tick.
    const voice = new Voice({ numBeats: opts.beatsPerBar, beatValue: 4 })
      .setMode(VoiceMode.SOFT)
      .addTickables(built.notes)
    // The staff must be given to the notes BEFORE measuring them: `formatToStave` uses it for the
    // width but does not attach it to the notes, and until they have it `getNoteHeadBeginX()`
    // answers without the start-of-notes offset (clef, time signature, barline). That would be a
    // constant error per bar — measured: +66.1 on the first, +279 on the second — i.e. the right
    // grid in the wrong place.
    voice.setStave(stave)
    built.notes.forEach((n) => {
      n.setStave(stave)
    })
    new Formatter().joinVoices([voice]).formatToStave([voice], stave)
    placeOnTimeGrid(bar, built.notes, gridX0 + col * naturalBar)
    voice.draw(ctx, stave)
    built.beams.forEach((b) => {
      b.setContext(ctx).draw()
    })
    built.tuplets.forEach((t) => {
      t.setContext(ctx).draw()
    })
    // `getNoteHeadBeginX`, not `getAbsoluteX`: the latter is the note's anchor in the formatter and
    // falls ~7px to the right of the notehead's left edge — irrelevant for a 2px barline, visible
    // for the cursor's band, which is as wide as the notehead and must sit exactly on top of it.
    built.slotNotes.forEach((note, slotIndex) => {
      notes.set(slotIndex, { note, x: note.getNoteHeadBeginX() * fit.scale, row })
    })
    beams.push(...built.beams)
    tuplets.push(...built.tuplets)
  })

  // Where the next note would land if the row kept going: it is the end-of-row barline, and it sits
  // on the grid like everything else.
  const rowEndX = fit.scale * (gridX0 + fit.barsPerRow * naturalBar)
  return { width, height, rows, fit, rowEndX, notes, beams, tuplets }
}
