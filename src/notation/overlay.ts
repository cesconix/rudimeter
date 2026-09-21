import { barLength, flattenBar, metersOf } from '../score/events'
import { add, toNumber, ZERO } from '../score/fraction'
import { type EventId, keyOf, playbackKey } from '../score/ids'
import type { Score } from '../score/types'
import type { PlaybackBar, PlaybackEvent } from '../score/unroll'
import type { CursorPoint } from './cursor'
import { BAR_PAD, type BarLayout, type Layout, LINE_PX, REST_LINE, SNARE_LINE, STAFF_LINES, STAFF_TOP } from './layout'

/**
 * Everything here is in PLAYBACK POSITION (whole-note units), never seconds: inside a row x is
 * linear in position (the time grid), so a cursor point at `t = position` interpolates exactly,
 * and a tempo change rebuilds nothing — the transport is the only place seconds become a position.
 */

/** Index in `playback` of the bar a position is in: the last bar starting at or before it; the last bar past the end. */
export function playbackBarAt(starts: number[], position: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= position) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * One point per event of every emitted bar, plus one at each bar's END (x = where the bar's grid
 * ends: the row's `rowEndX` on the row's last bar). Rows differ in width and a playback jump is
 * not always a row wrap — back to a repeat's start, over a meter gutter — so the cursor slides to
 * the bar's end during its last event and jumps from there, instead of interpolating across the
 * score towards wherever it lands. The end point and the next bar's first point share one `t`:
 * `cursorAt` lands on the later of the two at that instant, and never has an interval that
 * crosses rows. Natural px.
 *
 * One exception to "the grid's end": when the bar that plays next is the next written bar on the
 * same row with nothing but `BAR_PAD` before its grid, the end point sits at that bar's grid start
 * instead, so the last event's slide crosses the barline and the pad in one motion. A 12 px jump on
 * every barline would read as a tick; the slide costs a twelfth of the speed on a quarter and half
 * of it on a sixteenth, only inside the bar's last event. A meter gutter keeps the jump: 53 px in
 * one sixteenth is a lurch, not a slide.
 *
 * The points come out in time order by construction — one voice, walked bar by bar in playback
 * order — so nothing is sorted or deduplicated; `overlay.test.ts` pins that over the library.
 */
export function cursorPoints(layout: Layout, score: Score, playback: PlaybackBar[]): CursorPoint[] {
  const meters = metersOf(score)
  const barOf = new Map<number, BarLayout>()
  for (const row of layout.rows) for (const b of row.bars) barOf.set(b.barIndex, b)
  const out: CursorPoint[] = []
  let start = ZERO
  playback.forEach((pb, i) => {
    const lb = barOf.get(pb.barIndex)
    const row = layout.rowOfBar[pb.barIndex]
    for (const f of flattenBar(score.bars[pb.barIndex])) {
      const id: EventId = { bar: pb.barIndex, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      const box = layout.boxes.get(keyOf(id))
      if (box) out.push({ t: toNumber(add(start, f.offset)), x: box.x, row })
    }
    const end = add(start, barLength(meters[pb.barIndex]))
    // `lb` is always found — every playback bar has a `BarLayout` — but the guard stays loud
    // instead of a non-null assertion: were it ever missing, the bar-end point would be dropped
    // and the wrap branch (`cursorAt`'s unused `rowEndX = 0`) would reappear; `overlay.test.ts`
    // guards this invariant over the whole library.
    if (lb) {
      const next = playback[i + 1]
      const nb = next && next.barIndex === pb.barIndex + 1 ? barOf.get(next.barIndex) : undefined
      const padded = nb !== undefined && layout.rowOfBar[nb.barIndex] === row && nb.head === BAR_PAD
      out.push({ t: toNumber(end), x: padded ? nb.x : lb.x + lb.width, row })
    }
    start = end
  })
  return out
}

/** The playback keys sounding at a position. The transport-driven one is the only source today; the judge, later, is another. */
export type HighlightSource = (position: number) => string[]

/**
 * `[start, end)` per event, computed once: `end` is the exact fraction turned into a number, so
 * it is the same float as the next event's `start` and a boundary is never in both.
 */
export function transportHighlights(events: PlaybackEvent[]): HighlightSource {
  const spans = events.map((e) => ({
    key: e.key,
    start: toNumber(e.position),
    end: toNumber(add(e.position, e.length)),
  }))
  return (position) => spans.filter((s) => s.start <= position && position < s.end).map((s) => s.key)
}

/** The playback keys of every event whose `[start, end)` holds `position`: one, with one voice. */
export const highlightAt = (events: PlaybackEvent[], position: number): string[] =>
  transportHighlights(events)(position)

export interface HighlightRect {
  row: number
  /** natural px inside the row: the event's slice of the time grid, padded */
  x: number
  width: number
  /** natural px from the row top: the line the head sits on, padded */
  y: number
  height: number
}

/** Air around a highlight box, natural px: enough to clear the head, not enough to reach the neighbour. */
export const HIGHLIGHT_PAD = 4

/** y of a staff line counted from the bottom (`SNARE_LINE`, `REST_LINE`), natural px from the row top. */
const lineY = (line: number): number => STAFF_TOP + (STAFF_LINES - 1 - line) * LINE_PX

/**
 * One rectangle per event of every emitted bar, keyed by playback key: a stroke's on the snare's
 * line, a rest's on the rest line, half a line space above and below plus the pad. Geometry only:
 * nothing here reads the SVG.
 */
export function highlightRects(score: Score, layout: Layout, playback: PlaybackBar[]): Map<string, HighlightRect> {
  const out = new Map<string, HighlightRect>()
  for (const pb of playback) {
    for (const f of flattenBar(score.bars[pb.barIndex])) {
      const id: EventId = { bar: pb.barIndex, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      const box = layout.boxes.get(keyOf(id))
      if (!box) continue
      const line = f.event.rest ? REST_LINE : SNARE_LINE
      const top = lineY(line) - LINE_PX / 2 - HIGHLIGHT_PAD
      const bottom = lineY(line) + LINE_PX / 2 + HIGHLIGHT_PAD
      out.set(playbackKey(id, pb.pass), {
        row: box.row,
        x: box.x - HIGHLIGHT_PAD,
        width: box.width + 2 * HIGHLIGHT_PAD,
        y: top,
        height: bottom - top,
      })
    }
  }
  return out
}
