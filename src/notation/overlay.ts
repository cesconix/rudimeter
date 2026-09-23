import { barLength, flattenBar, metersOf } from '../score/events'
import { add, toNumber, ZERO } from '../score/fraction'
import { type EventId, playbackKey } from '../score/ids'
import type { Score } from '../score/types'
import type { PlaybackEvent } from '../score/unroll'
import type { CursorPoint } from './cursor'
import { HEAD_INK, type Layout, LINE_PX, REST_INK, restLine, SNARE_LINE, STAFF_LINES } from './layout'

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
 * One point per event of every drawn bar, plus one at each bar's END (x = where the bar's grid
 * ends: the row's `rowEndX` on the row's last bar). Rows differ in width and a meter gutter mid-row
 * is a jump, so the cursor slides to the bar's end during its last event and jumps from there,
 * instead of interpolating across the score towards wherever it lands. The end point and the next
 * bar's first point share one `t`: `cursorAt` lands on the later of the two at that instant, and
 * never has an interval that crosses rows. Natural px.
 *
 * One exception to "the grid's end": when the bar drawn next sits on the same row and draws no
 * signature, the end point sits at that bar's grid start instead, so the last event's slide crosses
 * the barline and the bar's head in one motion: the pad, the grace notes of its first note
 * (`barHeads`). A 12 px jump on every barline would read as a tick; the slide adds the head to the
 * last event's run instead — 12 px to a quarter's 96 at natural size on a plain barline, up to 41
 * before a drag, half again the speed — only inside that event: a speed-up reads better than a
 * jump. A meter gutter keeps the jump: 53 px in one sixteenth is a lurch, not a slide.
 *
 * The page is drawn out (`Layout.playback`): a pass boundary is a barline or a row wrap like any
 * other, and nothing here knows a repeat. The points come out in time order by construction — one
 * voice, walked bar by bar in drawn order — so nothing is sorted or deduplicated; `overlay.test.ts`
 * pins that over the library.
 */
export function cursorPoints(layout: Layout, score: Score): CursorPoint[] {
  const meters = metersOf(score)
  // The rows are packed in drawn order, so the flattened bars are indexed by playback index.
  const bars = layout.rows.flatMap((row) => row.bars)
  const out: CursorPoint[] = []
  let start = ZERO
  layout.playback.forEach((pb, i) => {
    const lb = bars[i]
    const row = layout.rowOfPlayback[i]
    for (const f of flattenBar(score.bars[pb.barIndex])) {
      const id: EventId = { bar: pb.barIndex, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      const box = layout.boxes.get(playbackKey(id, pb.pass))
      if (box) out.push({ t: toNumber(add(start, f.offset)), x: box.x, row })
    }
    const end = add(start, barLength(meters[pb.barIndex]))
    const nb = bars[i + 1]
    const slides = nb !== undefined && layout.rowOfPlayback[i + 1] === row && !nb.showMeter
    out.push({ t: toNumber(end), x: slides ? nb.x : lb.x + lb.width, row })
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
  /** natural px inside the row: the event's head or rest, padded */
  x: number
  width: number
  /** natural px from the row top: the same glyph, padded */
  y: number
  height: number
}

/**
 * Air between a glyph's ink and its highlight box, natural px: the head shows inside a frame. On the
 * tightest grid — a 32nd at natural size, heads 12 px apart — the box reaches 3.5 px under each
 * neighbour's head: a head's width, not a note's time, is what the box marks.
 */
export const HIGHLIGHT_PAD = 3

/** y of a staff line counted from the bottom (`SNARE_LINE`, `restLine`), natural px from the row top of a piece whose top line is at `staffTop`. */
const lineY = (staffTop: number, line: number): number => staffTop + (STAFF_LINES - 1 - line) * LINE_PX

/**
 * One rectangle per event of every drawn bar, keyed by playback key: the ink of a stroke's head on
 * the snare's line, of a rest on its rest line (`HEAD_INK`, `REST_INK`), plus the pad — the note that
 * sounds, never its time: the cursor band says where the time is. A dot, a flam's grace notes, a
 * roll's slashes stay outside: they belong to the note, but the box marks where it is. Geometry
 * only: nothing here reads the SVG.
 */
export function highlightRects(score: Score, layout: Layout): Map<string, HighlightRect> {
  const out = new Map<string, HighlightRect>()
  for (const pb of layout.playback) {
    for (const f of flattenBar(score.bars[pb.barIndex])) {
      const id: EventId = { bar: pb.barIndex, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      const key = playbackKey(id, pb.pass)
      const box = layout.boxes.get(key)
      if (!box) continue
      const { base } = f.event.duration
      const ink = f.event.rest ? REST_INK[base] : HEAD_INK[base]
      const y = lineY(layout.staffTop, f.event.rest ? restLine(base) : SNARE_LINE)
      out.set(key, {
        row: box.row,
        x: box.x + ink.left - HIGHLIGHT_PAD,
        width: ink.right - ink.left + 2 * HIGHLIGHT_PAD,
        y: y + ink.top - HIGHLIGHT_PAD,
        height: ink.bottom - ink.top + 2 * HIGHLIGHT_PAD,
      })
    }
  }
  return out
}
