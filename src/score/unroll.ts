import { barLength, flattenBar, metersOf } from './events'
import { add, type Fraction, ZERO } from './fraction'
import { type EventId, playbackKey } from './ids'
import type { Score } from './types'

export interface PlaybackBar {
  /** the written bar: `EventId.bar` of its events, the bar the cursor is on */
  barIndex: number
  pass: number
}

/**
 * The bars in playing order, repeats expanded. A `repeat.start` opens a section at its bar; a
 * `repeat.end` with no start since the previous section's end opens it right after that end —
 * books print it that way (50 Workout #43: bars 1–4 repeat, then 5–16 repeat with no sign at
 * bar 5). At a `repeat.end`, `pass < times` jumps back to the section start with `pass + 1`;
 * the last pass continues past it, and the bar after it opens fresh ground.
 */
export function unroll(score: Score): PlaybackBar[] {
  const bars = score.bars
  const out: PlaybackBar[] = []
  let i = 0
  let start = 0
  let pass = 1
  while (i < bars.length) {
    const bar = bars[i]
    if (bar.repeat?.start && i !== start) {
      start = i
      pass = 1
    }
    out.push({ barIndex: i, pass })
    if (bar.repeat?.end) {
      if (pass < (bar.repeat.end.times ?? 2)) {
        i = start
        pass++
        continue
      }
      start = i + 1
      pass = 1
    }
    i++
  }
  return out
}

export interface PlaybackEvent {
  id: EventId
  /** `keyOf(id)@pass` */
  key: string
  pass: number
  /** in PLAYBACK whole-note units: the emitted bars laid end to end */
  position: Fraction
  length: Fraction
  rest: boolean
}

/** Every event of every emitted bar, in playback order. */
export function eventsOf(score: Score, playback: PlaybackBar[]): PlaybackEvent[] {
  const meters = metersOf(score)
  const out: PlaybackEvent[] = []
  let barStart = ZERO
  for (const pb of playback) {
    for (const f of flattenBar(score.bars[pb.barIndex])) {
      const id: EventId = { bar: pb.barIndex, item: f.item }
      if (f.sub !== undefined) id.sub = f.sub
      out.push({
        id,
        key: playbackKey(id, pb.pass),
        pass: pb.pass,
        position: add(barStart, f.offset),
        length: f.length,
        rest: f.event.rest === true,
      })
    }
    barStart = add(barStart, barLength(meters[pb.barIndex]))
  }
  return out
}

/** Playback position where each emitted bar starts: what a seek by bar lands on. */
export function barStarts(score: Score, playback: PlaybackBar[]): Fraction[] {
  const meters = metersOf(score)
  const out: Fraction[] = []
  let pos = ZERO
  for (const pb of playback) {
    out.push(pos)
    pos = add(pos, barLength(meters[pb.barIndex]))
  }
  return out
}
