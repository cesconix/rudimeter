import { barLength, flattenVoice, metersOf } from '../score/events'
import { add, type Fraction, toNumber, ZERO } from '../score/fraction'
import { type EventId, keyOf } from '../score/ids'
import type { Meter, Score } from '../score/types'
import { sourceOf } from '../score/unroll'

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
 * Right of the last bar. Without it the end barline lands at x = width, on the SVG's edge, and is
 * clipped: the row seems to trail off. Eight pixels cover even the final barline, which is thick.
 */
export const RIGHT_PAD = 8
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
 * Above the staff: stems, beams, accents, tuplet numbers, text, a volta bracket, a tempo mark. Below
 * it: the feet's stems (35 px past the notehead), the sticking, a dynamic, a hairpin. Both are
 * constants for the whole piece, measured once in the gallery on the worst-case row and never per
 * exercise: the bands must stack.
 *
 * Measured on the worst-case row (gallery, "Measure band"): ink from −7.5 to 242 px in a 190 px
 * band with the top line at 70 → 78 px above the top line, 132 below the bottom one; above that,
 * 24 px for the tempo mark and the volta bracket, which VexFlow would otherwise draw inside the
 * stack: 78 + 24 = 102 → 110. Below: 80 + 52 + 4 = 136 → 140 (next multiple of LINE_PX: VexFlow
 * reads `spaceAboveStaffLn` in line spaces).
 *
 * Re-measured 2026-09-20, after the hands' sticking moved above the staff in two-voice bars (plan
 * 11, task 4): the gallery's "Measure band" now reads ink from 0.5 to 242.0 px in a [0, 290] band
 * with the top line at 110 — STAFF_TOP still gives 0 overflow above, unchanged. Below, the sticking
 * and its dynamics left the bottom of the band: ink bottom 242 px − the bottom line at
 * STAFF_TOP + STAFF_H = 150 → 92 px below the bottom line, + 4 px of air = 96 → 100 (next multiple
 * of LINE_PX).
 */
export const STAFF_TOP = 110
export const STAFF_BELOW = 100
export const SYSTEM_H = STAFF_TOP + STAFF_H + STAFF_BELOW
/** Notehead width at natural scale: the cursor is as wide as it, and the readability floor is measured on it. */
export const NOTEHEAD_PX = 11.8
/** Below this the notehead is no longer readable: the constraint that limits how many bars a row takes. */
export const MIN_NOTEHEAD_PX = 8

/**
 * Where a rest sits, in staff lines from the bottom. Alone in the bar, on the middle line; with a
 * second voice the hands' rests move up and the feet's down, so the two never print on top of each
 * other. The engraver turns these into VexFlow keys; the overlay reads them for a rest's highlight.
 */
export const REST_LINE = { single: 2, up: 3, down: 1 } as const

export interface ViewSpec {
  barsPerRow: number
  /** automatic layout: a bar marked `newRow` starts a row. A user-fixed bars-per-row ignores the mark. */
  auto: boolean
}

export interface EventBox {
  id: EventId
  row: number
  /** natural px: the event's slice of the time grid, not the glyph's extent. The notes of a chord share one box. */
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
  bracket?: { numbers: number[]; first: boolean; last: boolean }
}

export interface RowLayout {
  index: number
  bars: BarLayout[]
  /** the SVG's width: the grid end plus the right pad */
  widthNatural: number
  /** where the next bar would start if the row kept going: the cursor slides to it during the wrap */
  rowEndX: number
}

export interface Layout {
  rows: RowLayout[]
  /** keyOf(EventId) → box, one per written event. A simile bar carries the boxes of the bar it repeats, under its own bar index. */
  boxes: Map<string, EventBox>
  /** bar index → row index */
  rowOfBar: number[]
  systemH: number
  /** natural px: clef + meter gutter, plus the grace gutter when the piece has a grace note */
  gridX0: number
}

export const hasGrace = (score: Score): boolean =>
  score.bars.some((bar) =>
    Object.values(bar.parts ?? {}).some((part) =>
      part.voices.some((voice) => flattenVoice(voice).some((f) => f.event.grace !== undefined)),
    ),
  )

const sameEnding = (a?: number[], b?: number[]): boolean =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((x, i) => x === b[i])

/** The volta bracket a bar sits under: consecutive bars with the same ending numbers share one. */
function bracketOf(score: Score, b: number): BarLayout['bracket'] {
  const ending = score.bars[b].ending
  if (!ending) return undefined
  return {
    numbers: ending,
    first: !sameEnding(ending, score.bars[b - 1]?.ending),
    last: !sameEnding(ending, score.bars[b + 1]?.ending),
  }
}

/**
 * Rows of bars on the time grid, natural px, and one box per written event. Pure: the engraver
 * draws what this says, the overlay (plan 11) reads the boxes, nobody reads the DOM.
 */
export function buildLayout(score: Score, spec: ViewSpec): Layout {
  const meters = metersOf(score)
  const gridX0 = HEAD_PX + (hasGrace(score) ? GRACE_GUTTER : 0)
  // A user preference is a positive integer by construction; the guard is here because the function is exported.
  const perRow = Number.isFinite(spec.barsPerRow) ? Math.max(1, Math.floor(spec.barsPerRow)) : 1

  const rows: RowLayout[] = []
  const rowOfBar: number[] = []
  const layoutOfBar: BarLayout[] = []
  let bars: BarLayout[] = []
  let x = gridX0
  const close = () => {
    if (bars.length === 0) return
    const last = bars[bars.length - 1]
    const rowEndX = last.x + last.width
    rows.push({ index: rows.length, bars, widthNatural: rowEndX + RIGHT_PAD, rowEndX })
    bars = []
    x = gridX0
  }
  let previous: Meter | undefined
  score.bars.forEach((bar, b) => {
    const meter = meters[b]
    // The signature is drawn on the first bar and where the meter changes; a bar that restates the meter in force draws nothing.
    const changed = previous === undefined || meter[0] !== previous[0] || meter[1] !== previous[1]
    previous = meter
    if (bars.length >= perRow || (spec.auto && bar.newRow && bars.length > 0)) close()
    const first = bars.length === 0
    const head = first ? gridX0 : changed ? METER_PX : BAR_PAD
    if (!first) x += head
    const width = toNumber(barLength(meter)) * PX_PER_WHOLE
    const layoutBar: BarLayout = { barIndex: b, x, width, head, showClef: first, showMeter: changed }
    const bracket = bracketOf(score, b)
    if (bracket) layoutBar.bracket = bracket
    bars.push(layoutBar)
    layoutOfBar.push(layoutBar)
    rowOfBar.push(rows.length)
    x += width
  })
  close()

  const boxes = new Map<string, EventBox>()
  let position = ZERO
  score.bars.forEach((_bar, b) => {
    const lb = layoutOfBar[b]
    // A simile bar draws a sign, but the cursor and the highlight need the events it stands for, under its own index: that is how `eventsOf` keys them.
    const source = score.bars[sourceOf(score, b)]
    for (const part of score.parts) {
      source.parts?.[part.id]?.voices.forEach((voice, v) => {
        for (const f of flattenVoice(voice)) {
          const id: EventId = { bar: b, part: part.id, voice: v, item: f.item }
          if (f.sub !== undefined) id.sub = f.sub
          boxes.set(keyOf(id), {
            id,
            row: rowOfBar[b],
            x: lb.x + toNumber(f.offset) * PX_PER_WHOLE,
            width: toNumber(f.length) * PX_PER_WHOLE,
            position: add(position, f.offset),
            length: f.length,
            rest: f.event.rest === true,
          })
        }
      })
    }
    position = add(position, barLength(meters[b]))
  })

  return { rows, boxes, rowOfBar, systemH: SYSTEM_H, gridX0 }
}
