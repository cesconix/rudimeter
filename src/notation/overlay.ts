import { barLength, flattenVoice, metersOf } from '../score/events'
import { add, toNumber, ZERO } from '../score/fraction'
import { type EventId, keyOf, playbackKey } from '../score/ids'
import type { Catalogue } from '../score/instruments'
import type { Score } from '../score/types'
import type { PlaybackBar, PlaybackEvent } from '../score/unroll'
import type { CursorPoint } from './cursor'
import { type BarLayout, type Layout, LINE_PX, REST_LINE, STAFF_LINES, STAFF_TOP } from './layout'

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
 * not always a row wrap — back to a repeat's start, over a skipped ending, over a meter gutter —
 * so the cursor slides to the bar's end during its last event and jumps from there, instead of
 * interpolating across the score towards wherever it lands. The end point and the next bar's
 * first point share one `t`: `cursorAt` lands on the later of the two at that instant, and never
 * has an interval that crosses rows. Natural px.
 */
export function cursorPoints(layout: Layout, score: Score, playback: PlaybackBar[]): CursorPoint[] {
  const meters = metersOf(score)
  const barOf = new Map<number, BarLayout>()
  for (const row of layout.rows) for (const b of row.bars) barOf.set(b.barIndex, b)
  const out: CursorPoint[] = []
  let start = ZERO
  for (const pb of playback) {
    const lb = barOf.get(pb.barIndex)
    const row = layout.rowOfBar[pb.barIndex]
    // A simile bar carries the boxes of the bar it repeats under its own index (layout.ts).
    const source = score.bars[pb.sourceBarIndex]
    for (const part of score.parts) {
      source.parts?.[part.id]?.voices.forEach((voice, v) => {
        for (const f of flattenVoice(voice)) {
          const id: EventId = { bar: pb.barIndex, part: part.id, voice: v, item: f.item }
          if (f.sub !== undefined) id.sub = f.sub
          const box = layout.boxes.get(keyOf(id))
          if (box) out.push({ t: toNumber(add(start, f.offset)), x: box.x, row })
        }
      })
    }
    const end = add(start, barLength(meters[pb.barIndex]))
    if (lb) out.push({ t: toNumber(end), x: lb.x + lb.width, row })
    start = end
  }
  // Stable sort: at one `t` the insertion order stands — a bar's end before the next bar's first
  // event — which is what puts the cursor on the next bar at that instant. Two voices at the same
  // instant give the same point twice; the second is dropped.
  out.sort((a, b) => a.t - b.t)
  return out.filter((p, i) => i === 0 || p.t !== out[i - 1].t || p.x !== out[i - 1].x || p.row !== out[i - 1].row)
}

/** The playback keys sounding at a position. The transport-driven one is the only source in this plan; the judge, later, is another. */
export type HighlightSource = (position: number) => string[]

/**
 * `[start, end)` per non-hidden event, computed once: `end` is the exact fraction turned into a
 * number, so it is the same float as the next event's `start` and a boundary is never in both.
 */
export function transportHighlights(events: PlaybackEvent[]): HighlightSource {
  const spans = events
    .filter((e) => !e.hidden)
    .map((e) => ({ key: e.key, start: toNumber(e.position), end: toNumber(add(e.position, e.length)) }))
  return (position) => spans.filter((s) => s.start <= position && position < s.end).map((s) => s.key)
}

/** The playback keys of every non-hidden event whose `[start, end)` holds `position`: one per voice with something on. */
export const highlightAt = (events: PlaybackEvent[], position: number): string[] =>
  transportHighlights(events)(position)

export interface HighlightRect {
  row: number
  /** natural px inside the row: the event's slice of the time grid, padded */
  x: number
  width: number
  /** natural px from the row top: from the highest head to the lowest, padded */
  y: number
  height: number
}

/** Air around a highlight box, natural px: enough to clear the head, not enough to reach the neighbour. */
export const HIGHLIGHT_PAD = 4

/** y of a staff line counted from the bottom (`InstrumentSpec.line`), natural px from the row top. */
const lineY = (line: number): number => STAFF_TOP + (STAFF_LINES - 1 - line) * LINE_PX

/**
 * One rectangle per non-hidden event of every emitted bar, keyed by playback key. The vertical
 * extent comes from the catalogue — the highest and lowest head of the event, a rest on its rest
 * line — so a kick and a snare at the same instant are two boxes, one under the other, and never
 * one band across the staff. Geometry only: nothing here reads the SVG.
 */
export function highlightRects(
  score: Score,
  catalogue: Catalogue,
  layout: Layout,
  playback: PlaybackBar[],
): Map<string, HighlightRect> {
  const out = new Map<string, HighlightRect>()
  for (const pb of playback) {
    const source = score.bars[pb.sourceBarIndex]
    for (const part of score.parts) {
      const pbar = source.parts?.[part.id]
      if (!pbar) continue
      const two = pbar.voices.length > 1
      pbar.voices.forEach((voice, v) => {
        for (const f of flattenVoice(voice)) {
          if (f.event.hidden) continue
          const id: EventId = { bar: pb.barIndex, part: part.id, voice: v, item: f.item }
          if (f.sub !== undefined) id.sub = f.sub
          const box = layout.boxes.get(keyOf(id))
          if (!box) continue
          const lines = f.event.rest
            ? [REST_LINE[two ? voice.stem : 'single']]
            : (f.event.notes ?? []).map((n) => catalogue[n.instrument].line)
          if (lines.length === 0) continue
          const top = lineY(Math.max(...lines)) - LINE_PX / 2 - HIGHLIGHT_PAD
          const bottom = lineY(Math.min(...lines)) + LINE_PX / 2 + HIGHLIGHT_PAD
          out.set(playbackKey(id, pb.pass), {
            row: box.row,
            x: box.x - HIGHLIGHT_PAD,
            width: box.width + 2 * HIGHLIGHT_PAD,
            y: top,
            height: bottom - top,
          })
        }
      })
    }
  }
  return out
}
