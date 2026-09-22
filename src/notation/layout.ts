import { barLength, flattenBar, metersOf } from '../score/events'
import { add, type Fraction, toNumber, ZERO } from '../score/fraction'
import { type EventId, keyOf } from '../score/ids'
import type { Meter, Score } from '../score/types'

/**
 * Natural px: the geometry is computed once at this size and the engraver scales the whole row.
 * The row is a time axis — 384 px per whole note, 96 per quarter, as the old renderer had it — so
 * the cursor moves at constant speed and a rest lands where it sounds with nothing to anchor it.
 */
export const PX_PER_WHOLE = 384
/**
 * Clef + meter at the start of every row, drawn or not: one origin for every row keeps `gridX0` a
 * single number. Measured in the gallery ("Measurements") on the percussion clef + "12/8", the
 * widest signature in the library: 78.5 px to the first note, plus 4 px of air.
 */
export const HEAD_PX = 83
/** A meter change mid-row: what the signature takes before the bar's grid starts. Measured like HEAD_PX, on "12/8" alone: 48.2 px, plus 4 px of air. */
export const METER_PX = 53
/**
 * Gutter to the left of the grid when the piece has a grace note: a flam is drawn BEFORE its note
 * and nothing on the time grid reserves that space (measured: 23.7 px to the left of the notehead),
 * so on the first beat of a row it would land on the clef. It is a translation of the whole grid,
 * not a local exception — the origin moves, the steps do not, and the cursor keeps its speed. Paid
 * only by a piece that has one: 24 px less music per row, in 2/4 on a phone, is a bar per row.
 */
export const GRACE_GUTTER = 24
/**
 * Air on both sides of the row: before the first stave and after the last barline. The right side
 * was always needed — without it the end barline lands at x = width, on the SVG's edge, and its
 * thick line (drawn 2 px left of x and 1 px past it) is clipped, so the row seems to trail off.
 * The left side is the same eight pixels so the block of music sits centred in whatever draws it:
 * the app's frame, a bordered host in the gallery, a page. A row that starts on its container's
 * edge reads as cut. Sixteen pixels less music per row; the stretch absorbs them, and the one thing
 * that can move is `fit`'s bars per row, on a width within 8 px of a candidate's.
 */
export const SIDE_PAD = 8
/**
 * Air between a barline and the first note of the bar that follows it. The row head (`HEAD_PX`) and
 * the meter gutter (`METER_PX`) already carry it: both were measured as VexFlow's `getNoteStartX()`
 * plus its `Stave.padding`, which is 12 px (gallery, "Measure head"). A bar with neither had none,
 * so its first note printed against the barline. The pad is a head like the other two — the grid
 * starts after it — and the cursor slides through it during the previous bar's last event.
 */
export const BAR_PAD = 12
/** VexFlow's distance between staff lines (`Tables.STAVE_LINE_DISTANCE`). */
export const LINE_PX = 10
/** Five lines 10 px apart (VexFlow's spacing): a 40 px staff. */
export const STAFF_LINES = 5
export const STAFF_H = (STAFF_LINES - 1) * LINE_PX
/**
 * Above the staff: stems, beams, accents, tuplet numbers, grace notes, a text. Below it: the
 * sticking. Both are constants for the whole piece, measured once in the gallery on the pad worst
 * case and never per exercise: the bands must stack.
 *
 * Measured 2026-09-21 (gallery, "Measure band", Chrome on the Mac at dpr 2): ink 70.0 px above the
 * top line and 24.0 px below the bottom one on the worst-case row — a text over an accented eighth
 * triplet, a flam and a drag under accents, three slashes, a buzz, thirty-seconds, sticking under
 * everything. Plus 4 px of air, up to the next multiple of LINE_PX (VexFlow reads
 * `spaceAboveStaffLn` in line spaces): 70 + 4 → 80, 24 + 4 → 30. The kit's band was 110 / 100
 * (spec 09): the feet's stems, the dynamics, the hairpins, the volta bracket and the tempo mark
 * went with the kit.
 */
export const STAFF_TOP = 80
export const STAFF_BELOW = 30
export const SYSTEM_H = STAFF_TOP + STAFF_H + STAFF_BELOW
/** Notehead width at natural scale: the cursor is as wide as it, and the readability floor is measured on it. */
export const NOTEHEAD_PX = 11.8
/** Below this the notehead is no longer readable: the constraint that limits how many bars a row takes. */
export const MIN_NOTEHEAD_PX = 8

/**
 * Staff lines counted from the bottom: 0 is the first line, halves are the spaces. The snare sits
 * in the third space (PAS / Weinberg), every rest on the middle line. The engraver turns these into
 * VexFlow keys; the overlay reads them for a highlight's vertical extent.
 */
export const SNARE_LINE = 2.5
export const REST_LINE = 2

/**
 * How far the cursor band overflows above and below the staff, natural px, so the band marks the
 * NOTE — head, stem and sticking letter — and not just the staff; semi-transparent (`.score-cursor`)
 * so the head stays readable underneath. Measured 2026-09-21 (gallery, "Measure cursor", Chrome on
 * the Mac at dpr 2) on a quarter with its R: the stem tip 20.0 px above the top line, the letter's
 * bottom 24.0 px below the bottom one, plus 4 px of air: 24 / 28.
 */
export const CURSOR_ABOVE = 24
export const CURSOR_BELOW = 28

export interface ViewSpec {
  barsPerRow: number
  /** automatic layout: a bar marked `newRow` starts a row. A user-fixed bars-per-row ignores the mark. */
  auto: boolean
  /**
   * Natural px the rows may take: the viewport's width over the scale. The time grid stretches so
   * that the widest row reaches it — justification, as print does — and never shrinks; absent, the
   * grid keeps its natural `PX_PER_WHOLE`.
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
  /** px of stave before the grid: the row head on the first bar, a meter gutter on a change mid-row, `BAR_PAD` otherwise */
  head: number
  showClef: boolean
  showMeter: boolean
}

export interface RowLayout {
  index: number
  bars: BarLayout[]
  /** the SVG's width: the grid end plus the side pad */
  widthNatural: number
  /** where the next bar would start if the row kept going: the cursor slides to it during the wrap */
  rowEndX: number
}

export interface Layout {
  rows: RowLayout[]
  /** keyOf(EventId) → box, one per written event */
  boxes: Map<string, EventBox>
  /** bar index → row index */
  rowOfBar: number[]
  systemH: number
  /** natural px: clef + meter gutter, plus the grace gutter when the piece has a grace note */
  gridX0: number
  /** the time grid's factor over `PX_PER_WHOLE`: 1 at natural spacing, more when the rows are justified to `fillWidth` */
  stretch: number
}

export const hasGrace = (score: Score): boolean =>
  score.bars.some((bar) => flattenBar(bar).some((f) => f.event.grace !== undefined))

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
 * One stretch for the whole piece — the cursor keeps one speed from the first row to the last —
 * chosen so that the row which would overrun first exactly reaches `fillWidth`; every other row
 * stays shorter, as the last system of a printed page does. Never below 1: the grid is stretched to
 * fill, not shrunk to fit — that is the scale's job, in `fit`.
 */
function stretchToFill(packed: Packed[][], fillWidth: number | undefined): number {
  if (fillWidth === undefined || !Number.isFinite(fillWidth) || packed.length === 0) return 1
  const factors = packed.map((row) => {
    const fixed = row.reduce((sum, p) => sum + p.head, 0) + 2 * SIDE_PAD
    const music = row.reduce((sum, p) => sum + p.len, 0) * PX_PER_WHOLE
    return (fillWidth - fixed) / music
  })
  return Math.max(1, Math.min(...factors))
}

/**
 * Rows of bars on the time grid, natural px, and one box per written event. Pure: the engraver
 * draws what this says, the overlay reads the boxes, nobody reads the DOM.
 */
export function buildLayout(score: Score, spec: ViewSpec): Layout {
  const meters = metersOf(score)
  const gridX0 = HEAD_PX + (hasGrace(score) ? GRACE_GUTTER : 0)
  // A user preference is a positive integer by construction; the guard is here because the function is exported.
  const perRow = Number.isFinite(spec.barsPerRow) ? Math.max(1, Math.floor(spec.barsPerRow)) : 1

  // Pass one: which bar goes on which row, and what each prints before its grid. The x positions
  // wait for the stretch, which needs every row packed first.
  const packed: Packed[][] = []
  let row: Packed[] = []
  let previous: Meter | undefined
  score.bars.forEach((bar, b) => {
    const meter = meters[b]
    // The signature is drawn on the first bar and where the meter changes; a bar that restates the meter in force draws nothing.
    const changed = previous === undefined || meter[0] !== previous[0] || meter[1] !== previous[1]
    previous = meter
    if (row.length >= perRow || (spec.auto && bar.newRow && row.length > 0)) {
      packed.push(row)
      row = []
    }
    const first = row.length === 0
    const head = first ? gridX0 : changed ? METER_PX : BAR_PAD
    row.push({ barIndex: b, len: toNumber(barLength(meter)), head, showClef: first, showMeter: changed })
  })
  if (row.length > 0) packed.push(row)
  const stretch = stretchToFill(packed, spec.fillWidth)

  // Pass two: the geometry, on the stretched grid.
  const rows: RowLayout[] = []
  const rowOfBar: number[] = []
  const layoutOfBar: BarLayout[] = []
  for (const r of packed) {
    const bars: BarLayout[] = []
    let x = SIDE_PAD
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
    rows.push({ index: rows.length, bars, widthNatural: x + SIDE_PAD, rowEndX: x })
  }

  const boxes = new Map<string, EventBox>()
  let position = ZERO
  score.bars.forEach((bar, b) => {
    const lb = layoutOfBar[b]
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

  return { rows, boxes, rowOfBar, systemH: SYSTEM_H, gridX0, stretch }
}
