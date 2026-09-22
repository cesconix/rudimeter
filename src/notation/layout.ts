import { resolveBeams } from '../score/beaming'
import { barLength, flattenBar, metersOf } from '../score/events'
import { add, type Fraction, toNumber, ZERO } from '../score/fraction'
import { type EventId, keyOf } from '../score/ids'
import type { NoteBase, Score, TupletGroup } from '../score/types'

/**
 * Natural px: the geometry is computed once at this size and the engraver scales the whole row.
 * The row is a time axis — 384 px per whole note, 96 per quarter, as the old renderer had it — so
 * the cursor moves at constant speed and a rest lands where it sounds with nothing to anchor it.
 */
export const PX_PER_WHOLE = 384
/**
 * A bar keeps free before its grid what it prints there, and nothing more (`barHeads`): a row that
 * reprints only its clef starts its music sooner than the first one, which draws the signature too,
 * as printed music does. Every width below is measured in the gallery ("Measurements", "Measure
 * head") on what VexFlow draws, never chosen.
 *
 * Clef + meter, at the start of a row that draws a signature. Measured on the percussion clef +
 * "12/8", the widest signature in the library: 78.5 px to the first note, plus 4 px of air.
 */
export const HEAD_PX = 83
/** The clef alone, at the start of a row that draws no signature. Measured like HEAD_PX: 32.3 px to the first note, plus 4 px of air. */
export const CLEF_PX = 37
/** A meter change mid-row: what the signature takes before the bar's grid starts. Measured like HEAD_PX, on "12/8" alone: 48.2 px, plus 4 px of air. */
export const METER_PX = 53
/**
 * A begin repeat after the clef or a signature, on top of their room. Its dots end 25.5 px past
 * their ink — read from pixels: VexFlow's own note start does not count them — and the bar's first
 * note keeps 11 px from the dots, the air it keeps from a plain barline (`BAR_PAD` less the
 * barline's 1 px): 91.5 + 11 → 103 = HEAD_PX + 20 after the clef and "12/8", 45.5 + 11 → 57 =
 * CLEF_PX + 20 after the clef alone, 61.5 + 11 → 73 = METER_PX + 20 after "12/8" mid-row.
 */
export const REPEAT_PX = 20
/** A begin repeat where a plain barline would be, mid-row, on top of `BAR_PAD`: its dots end 10 px after the bar's start, the barline 1 px: 10 + 11 → 21 = BAR_PAD + 9. */
export const REPEAT_BAR_PX = 9
/**
 * A grace note on a bar's first note is drawn BEFORE it, and nothing on the time grid reserves that
 * space: across the barline, on the repeat's dots or on the clef, until the bar keeps it free before
 * its grid — the grace notes then sit where the note alone would, as clear of what precedes them.
 * Read from pixels, from the grace ink's left edge to its note's head: 24.2 px for a flam, 28.2 for
 * a drag. Outside the grid like every head, so the grid's speed is untouched; a grace note later in
 * the bar is drawn in the time before its note.
 */
export const FLAM_PX = 25
export const DRAG_PX = 29
/**
 * A row has no spacing on its perimeter: its ink starts on the SVG's left edge (the stave's first
 * line and barline at x = 0, the bar number anchored there) and ends on its right edge, so it sits
 * flush in any container and the container's padding alone decides the air around it, as a
 * design-system component does. The one thing past the last bar's end x is the end barline's own
 * ink: VexFlow draws every end barline — single, double, final, repeat — with its rightmost pixel
 * column at x (`fillRect(x, …, 1)`, `fillRect(x − 2, …, 3)`), so the row is 1 px wider than its
 * grid end. Checked in the gallery ("Measure edges"): no row's ink leaves [0, width].
 */
export const BARLINE_OVERHANG = 1
/**
 * Air between a barline and the first note of the bar that follows it. The row heads (`HEAD_PX`,
 * `CLEF_PX`) and the meter gutter (`METER_PX`) already carry it: all three were measured as
 * VexFlow's `getNoteStartX()` plus its `Stave.padding`, which is 12 px (gallery, "Measure head"). A
 * bar with none of them had none, so its first note printed against the barline. The pad is a head
 * like the others — the grid starts after it — and the cursor slides through it during the previous
 * bar's last event.
 */
export const BAR_PAD = 12
/** VexFlow's distance between staff lines (`Tables.STAVE_LINE_DISTANCE`). */
export const LINE_PX = 10
/** Five lines 10 px apart (VexFlow's spacing): a 40 px staff. */
export const STAFF_LINES = 5
export const STAFF_H = (STAFF_LINES - 1) * LINE_PX
/**
 * The sticking letters' ink under the bottom line, natural px: from the air over them to their
 * bottom. VexFlow places a BOTTOM annotation from the stave, not from its note, so every letter of
 * every piece sits there. Measured 2026-09-22 (gallery, "Measure band", Chrome on the Mac at dpr 2).
 */
export const STICKING_INK = { top: 13.5, bottom: 24 }
/**
 * The air under the letters, down to the next row's highest ink, against the air over them: at least
 * twice as much, so the eye ties the letters to the staff above them at once. With the two alike
 * (15.5 px under them on the old fixed band's densest rows) a reader could not tell which row they
 * belonged to. Chosen on the gallery's figures, 2026-09-22, over once and three times as much.
 */
export const STICKING_AIR = 2
/**
 * Below the staff: the letters and their air, for every piece — one without sticking keeps the
 * room, so rows breathe alike from one piece to the next. Above it the piece decides (`rowBand`).
 */
export const STAFF_BELOW = Math.ceil(STICKING_INK.bottom + STICKING_AIR * STICKING_INK.top)

/** How high one event's ink reaches, by the marks it carries: its accent, its text, or both. */
interface Marks {
  none: number
  accent: number
  text: number
  accentText: number
}

/**
 * Ink above the top line, natural px, of one event on the snare, stem up: by whether a tuplet's
 * bracket rides over it, whether its stems are a 32nd's (flagged, or on a beam a 32nd is on: the
 * beam sits higher) or anything longer, and its marks. Measured 2026-09-22 (gallery, "Measure band",
 * Chrome on the Mac at dpr 2), each entry the highest over every value of its kind — whole to
 * sixteenth, flagged and beamed; a 32nd flagged, beamed, beamed with sixteenths; tuplets of 2 to 13
 * of each — with a drag and three slashes, a flam and a buzz on every stroke or neither: those stay
 * under the stem. Half a pixel moves with where the glyphs land on the pixel grid (a text over an
 * accent under a bracket: 70 on most tuplets, 70.5 on some), so an entry is the highest of them. The
 * layers do not add up, so the table holds each combination: an accent lifts a stroke 15.5 px, under
 * a bracket 22.5; a text over a rest sits as high as one over an accented stroke, or lower (55 and 55,
 * 57.5 and 62.5, 70 and 70.5, 77.5 and 77.5), and counts as one.
 */
export const INK_ABOVE: Record<'free' | 'tuplet', Record<'plain' | 'thirtySecond', Marks>> = {
  free: {
    plain: { none: 20.5, accent: 35.5, text: 40, accentText: 55 },
    thirtySecond: { none: 27.5, accent: 45.5, text: 47.5, accentText: 62.5 },
  },
  tuplet: {
    plain: { none: 40, accent: 62.5, text: 62.5, accentText: 70.5 },
    thirtySecond: { none: 47.5, accent: 70, text: 70, accentText: 77.5 },
  },
}
/** The grey labels' ink above the top line (bar numbers 1 to 24, a repeat's "×N"), natural px: every row has one. Measured with `INK_ABOVE`. */
export const LABEL_INK_ABOVE = 21
/** Notehead width at natural scale: the cursor is as wide as it, and the readability floor is measured on it. */
export const NOTEHEAD_PX = 11.8
/** Below this the notehead is no longer readable: the constraint that limits how many bars a row takes. */
export const MIN_NOTEHEAD_PX = 8

/**
 * Staff lines counted from the bottom: 0 is the first line, halves are the spaces. The snare sits
 * in the third space (PAS / Weinberg). A rest is on the middle line, the whole rest excepted: it
 * hangs from the fourth line (Gould, Behind Bars), where VexFlow puts one on its own. The engraver
 * turns these into VexFlow keys; the overlay reads them for a highlight's vertical extent.
 */
export const SNARE_LINE = 2.5
export const restLine = (base: NoteBase): number => (base === 1 ? 3 : 2)

/** How far above the top line the grey labels (bar numbers, a repeat's "×N") sit on their baseline, natural px. */
export const LABEL_ABOVE = 8

/**
 * How far the cursor band reaches past the staff, above and below alike, natural px: the band is the
 * time, centred on the staff, and runs over nothing but it — the highlight box, not the band, says
 * which note sounds. Half the labels' height, so it stops under their baseline (their digits and "×"
 * have no descender); the stems' tips, beams, accents, tuplet brackets and texts are higher still,
 * the sticking letters lower (the gallery figures with the cursor drawn over them, 2026-09-22: with
 * the band 24 px above the top line and 28 below, to cover the stem and the letter, a group of
 * 32nds' beams ran across its top edge, a septuplet's bracket touched it, the "×N" was half under
 * it, and the band hung below the staff).
 */
export const CURSOR_OVERHANG = LABEL_ABOVE / 2

/** A glyph's ink around a point, natural px: `left`/`right` from its x, `top`/`bottom` from its y (down is positive). */
export interface Ink {
  left: number
  right: number
  top: number
  bottom: number
}

/** The black notehead's ink, which the half note's head shares (Bravura draws both 1.18 spaces wide). */
const BLACK_HEAD: Ink = { left: -0.5, right: 12, top: -5.5, bottom: 5 }

/**
 * The ink of the snare's head, per written value, and of each rest, around the point the layout
 * puts the event at: x from its grid x (where the engraver starts its head, `placeOnGrid`), y from
 * its line (`SNARE_LINE`, `restLine`). A highlight box frames this ink. Measured 2026-09-22 (gallery,
 * "Measure highlight", Chrome on the Mac at dpr 2, so to the half pixel, antialiasing included): a head
 * is the glyph alone, without its stem and flag; the rests differ in size, a sixteenth reaching two
 * spaces below its line, a 32nd 1.75 above.
 */
export const HEAD_INK: Record<NoteBase, Ink> = {
  1: { left: -0.5, right: 17.5, top: -5.5, bottom: 5 },
  2: BLACK_HEAD,
  4: BLACK_HEAD,
  8: BLACK_HEAD,
  16: BLACK_HEAD,
  32: BLACK_HEAD,
}
export const REST_INK: Record<NoteBase, Ink> = {
  1: { left: -0.5, right: 11.5, top: -1, bottom: 5.5 },
  2: { left: -0.5, right: 11.5, top: -6, bottom: 0.5 },
  4: { left: -0.5, right: 11, top: -15.5, bottom: 15 },
  8: { left: -0.5, right: 10.5, top: -7.5, bottom: 10.5 },
  16: { left: -0.5, right: 13, top: -7.5, bottom: 20 },
  32: { left: -0.5, right: 15, top: -17.5, bottom: 20 },
}

export interface ViewSpec {
  barsPerRow: number
  /** automatic layout: a bar marked `newRow` starts a row. A user-fixed bars-per-row ignores the mark. */
  auto: boolean
  /**
   * Natural px the rows may take: the viewport's width over the scale. Each row's time grid
   * stretches so the row reaches it — justification, as print does — and never shrinks (`stretches`);
   * absent, the grid keeps its natural `PX_PER_WHOLE`.
   */
  fillWidth?: number
}

export interface EventBox {
  id: EventId
  row: number
  /** natural px: the event's slice of the time grid, not the glyph's extent */
  x: number
  width: number
  /** written position from the start of the piece, whole-note units */
  position: Fraction
  /** sounding length: the written value scaled by the tuplet, if any */
  length: Fraction
  rest: boolean
}

export interface BarLayout {
  barIndex: number
  /** natural px: where the bar's time grid starts and how wide it is */
  x: number
  width: number
  /** px of stave before the grid: what the bar prints there (`barHeads`) */
  head: number
  showClef: boolean
  showMeter: boolean
}

export interface RowLayout {
  index: number
  bars: BarLayout[]
  /** the SVG's width: the grid end plus the end barline's overhang, so the ink ends on the edge */
  widthNatural: number
  /** where the next bar would start if the row kept going: the cursor slides to it during the wrap */
  rowEndX: number
  /** the row's time grid over `PX_PER_WHOLE`: 1 at natural spacing, more when the row is justified to `fillWidth` */
  stretch: number
}

export interface Layout {
  rows: RowLayout[]
  /** keyOf(EventId) → box, one per written event */
  boxes: Map<string, EventBox>
  /** bar index → row index */
  rowOfBar: number[]
  /** the piece's band (`rowBand`): every row is `systemH` high, its top line `staffTop` from its top */
  staffTop: number
  systemH: number
}

/** What a bar keeps free before its grid, natural px, when it starts a row and when it follows another bar on one. */
export interface BarHead {
  first: number
  after: number
  /** the bar draws its time signature: the piece's first bar, and every bar whose meter differs from the previous one */
  signature: boolean
}

/**
 * Each bar's head: the clef when it starts a row, its signature, a begin repeat, the grace notes of
 * its first note — each measured (the constants above), summed, and nothing else. `buildLayout`
 * picks one of the two per bar; `fit` bounds a row by the largest of each.
 */
export function barHeads(score: Score): BarHead[] {
  const meters = metersOf(score)
  return score.bars.map((bar, b) => {
    const meter = meters[b]
    const previous = meters[b - 1]
    // A bar that restates the meter in force draws nothing.
    const signature = previous === undefined || meter[0] !== previous[0] || meter[1] !== previous[1]
    const repeat = bar.repeat?.start === true
    const kind = flattenBar(bar)[0]?.event.grace?.kind
    const grace = kind === 'flam' ? FLAM_PX : kind === 'drag' ? DRAG_PX : 0
    const first = (signature ? HEAD_PX : CLEF_PX) + (repeat ? REPEAT_PX : 0) + grace
    const after = (signature ? METER_PX + (repeat ? REPEAT_PX : 0) : BAR_PAD + (repeat ? REPEAT_BAR_PX : 0)) + grace
    return { first, after, signature }
  })
}

/** What one stack carries (a stroke, a rest, or a tuplet's whole group): its stems' class and its marks. */
interface Stack {
  thirtySecond: boolean
  accent: boolean
  text: boolean
}

const heightOf = (s: Stack, tuplet: boolean): number => {
  const marks = INK_ABOVE[tuplet ? 'tuplet' : 'free'][s.thirtySecond ? 'thirtySecond' : 'plain']
  return s.accent ? (s.text ? marks.accentText : marks.accent) : s.text ? marks.text : marks.none
}

/**
 * The highest ink above the top line anywhere in the piece, natural px, read from the score: the
 * tallest event (`INK_ABOVE`), or the labels every row carries. A tuplet is one stack: its bracket
 * rides over the whole group at its highest stroke, so the group takes every mark any of its events
 * carries. A stroke beamed with a 32nd hangs from the 32nd's beam, and takes its class.
 */
export function inkAbove(score: Score): number {
  const meters = metersOf(score)
  let top = LABEL_INK_ABOVE
  score.bars.forEach((bar, b) => {
    const flat = flattenBar(bar)
    const onBeam32: boolean[] = flat.map(() => false)
    let start = 0
    resolveBeams(meters[b], bar.beams, flat).forEach((mark, i) => {
      if (mark === 'begin') start = i
      if (mark !== 'end') return
      const run = flat.slice(start, i + 1)
      if (run.some((f) => f.event.duration.base === 32)) for (let k = start; k <= i; k++) onBeam32[k] = true
    })
    const groups = new Map<TupletGroup, Stack>()
    flat.forEach((f, i) => {
      const e = f.event
      const text = e.text !== undefined
      // A text over a rest counts as one over an accented stroke: VexFlow stacks it over the rest's hidden stem.
      const own: Stack = {
        thirtySecond: e.duration.base === 32 || onBeam32[i],
        accent: e.accent === true || (e.rest === true && text),
        text,
      }
      if (!f.tuplet) {
        top = Math.max(top, heightOf(own, false))
        return
      }
      const group = groups.get(f.tuplet)
      groups.set(
        f.tuplet,
        group
          ? {
              thirtySecond: group.thirtySecond || own.thirtySecond,
              accent: group.accent || own.accent,
              text: group.text || own.text,
            }
          : own,
      )
    })
    for (const group of groups.values()) top = Math.max(top, heightOf(group, true))
  })
  return top
}

/** One piece's band, natural px: where its staff's top line sits, and the height every row takes. */
export interface Band {
  staffTop: number
  systemH: number
}

/**
 * The band of every row of a piece: the same for all of them, so the staff sits at one height and the
 * rows read as one page, and set by the piece's highest ink (`inkAbove`), so a plain piece is not
 * spaced for marks it never prints. Whole px: the staff's lines on the pixel grid.
 */
export function rowBand(score: Score): Band {
  const staffTop = Math.ceil(inkAbove(score))
  return { staffTop, systemH: staffTop + STAFF_H + STAFF_BELOW }
}

/** A bar packed on a row, before the grid is stretched: what it prints before its grid and how long it lasts. */
interface Packed {
  barIndex: number
  /** whole-note units */
  len: number
  head: number
  showClef: boolean
  showMeter: boolean
}

/**
 * Each row's stretch: the factor that brings it exactly to `fillWidth`, so every row ends on the same
 * right edge, as the systems of a printed page do. Rows keep different heads — a signature, a
 * repeat, a flam on the downbeat — so their factors differ by a few percent, and the cursor changes
 * speed a little at a row wrap, never inside a row. A row with fewer bars than the fullest (the
 * piece's last, or one a `newRow` mark cuts short) is not spread across the width: it takes the
 * smallest stretch of the full rows, or its own when that is smaller. Never below 1: the grid is
 * stretched to fill, not shrunk to fit — that is the scale's job, in `fit`.
 */
function stretches(packed: Packed[][], fillWidth: number | undefined): number[] {
  if (fillWidth === undefined || !Number.isFinite(fillWidth)) return packed.map(() => 1)
  const own = packed.map((row) => {
    const fixed = row.reduce((sum, p) => sum + p.head, 0) + BARLINE_OVERHANG
    const music = row.reduce((sum, p) => sum + p.len, 0) * PX_PER_WHOLE
    return Math.max(1, (fillWidth - fixed) / music)
  })
  const fullest = Math.max(...packed.map((row) => row.length))
  const tightest = Math.min(...own.filter((_, r) => packed[r].length === fullest))
  return own.map((s, r) => (packed[r].length === fullest ? s : Math.min(s, tightest)))
}

/**
 * Rows of bars on the time grid, natural px, and one box per written event. Pure: the engraver
 * draws what this says, the overlay reads the boxes, nobody reads the DOM.
 */
export function buildLayout(score: Score, spec: ViewSpec): Layout {
  const meters = metersOf(score)
  const heads = barHeads(score)
  // A user preference is a positive integer by construction; the guard is here because the function is exported.
  const perRow = Number.isFinite(spec.barsPerRow) ? Math.max(1, Math.floor(spec.barsPerRow)) : 1

  // Pass one: which bar goes on which row, and what each prints before its grid. The x positions
  // wait for the stretches, which need every row packed first.
  const packed: Packed[][] = []
  let row: Packed[] = []
  score.bars.forEach((bar, b) => {
    if (row.length >= perRow || (spec.auto && bar.newRow && row.length > 0)) {
      packed.push(row)
      row = []
    }
    const first = row.length === 0
    const { signature } = heads[b]
    const head = first ? heads[b].first : heads[b].after
    row.push({ barIndex: b, len: toNumber(barLength(meters[b])), head, showClef: first, showMeter: signature })
  })
  if (row.length > 0) packed.push(row)
  const stretchOf = stretches(packed, spec.fillWidth)

  // Pass two: the geometry, each row on its stretched grid.
  const rows: RowLayout[] = []
  const rowOfBar: number[] = []
  const layoutOfBar: BarLayout[] = []
  for (const r of packed) {
    const stretch = stretchOf[rows.length]
    const bars: BarLayout[] = []
    let x = 0
    for (const p of r) {
      x += p.head
      const width = p.len * PX_PER_WHOLE * stretch
      const lb: BarLayout = {
        barIndex: p.barIndex,
        x,
        width,
        head: p.head,
        showClef: p.showClef,
        showMeter: p.showMeter,
      }
      bars.push(lb)
      layoutOfBar[p.barIndex] = lb
      rowOfBar[p.barIndex] = rows.length
      x += width
    }
    rows.push({ index: rows.length, bars, widthNatural: x + BARLINE_OVERHANG, rowEndX: x, stretch })
  }

  const boxes = new Map<string, EventBox>()
  let position = ZERO
  score.bars.forEach((bar, b) => {
    const lb = layoutOfBar[b]
    const { stretch } = rows[rowOfBar[b]]
    for (const f of flattenBar(bar)) {
      const id: EventId = { bar: b, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      boxes.set(keyOf(id), {
        id,
        row: rowOfBar[b],
        x: lb.x + toNumber(f.offset) * PX_PER_WHOLE * stretch,
        width: toNumber(f.length) * PX_PER_WHOLE * stretch,
        position: add(position, f.offset),
        length: f.length,
        rest: f.event.rest === true,
      })
    }
    position = add(position, barLength(meters[b]))
  })

  return { rows, boxes, rowOfBar, ...rowBand(score) }
}
