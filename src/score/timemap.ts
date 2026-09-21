import { barLength, metersOf } from './events'
import { type Fraction, lengthOf, toNumber } from './fraction'
import type { Duration, Meter, NoteBase, Score } from './types'
import type { PlaybackBar } from './unroll'

export interface TimeMap {
  /** playback seconds at a playback position (whole-note units); clamped to the piece */
  secondsAt(position: number | Fraction): number
  /** playback position at a playback second; clamped to the piece */
  positionAt(seconds: number): number
  end: number
  endPosition: number
}

/**
 * The beat the bpm counts: the denominator's note — a quarter in x/4, a half in x/2, an eighth in
 * 3/8 — dotted in a compound meter (6/8, 9/8, 12/8: a dotted quarter), which is a denominator of 8
 * or shorter with a numerator that is a multiple of 3 above 3. With tempo marks gone from the
 * model the transport's bpm is the only tempo, and this is what it means on every meter.
 */
export function beatOf(meter: Meter): Duration {
  const [num, den] = meter
  const compound = den >= 8 && num > 3 && num % 3 === 0
  return compound ? { base: (den / 2) as NoteBase, dots: 1 } : { base: den as NoteBase }
}

/** Seconds one whole note lasts: 60 / bpm is one beat, and a beat is `beatOf(meter)` of a whole. */
export const secondsPerWhole = (meter: Meter, bpm: number): number => 60 / bpm / toNumber(lengthOf(beatOf(meter)))

interface Segment {
  pos: number
  sec: number
  /** seconds per whole note in this bar */
  spw: number
}

export function buildTimeMap(score: Score, playback: PlaybackBar[], bpm: number): TimeMap {
  const meters = metersOf(score)
  const segs: Segment[] = []
  let pos = 0
  let sec = 0
  for (const pb of playback) {
    const spw = secondsPerWhole(meters[pb.barIndex], bpm)
    segs.push({ pos, sec, spw })
    const len = toNumber(barLength(meters[pb.barIndex]))
    pos += len
    sec += len * spw
  }
  const end = sec
  const endPosition = pos
  /** The last segment starting at or before `x` on the given axis (segments are sorted on both). */
  const find = (axis: 'pos' | 'sec', x: number): Segment => {
    let lo = 0
    let hi = segs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (segs[mid][axis] <= x) lo = mid
      else hi = mid - 1
    }
    return segs[lo]
  }
  const clamp = (x: number, max: number) => Math.min(max, Math.max(0, x))
  return {
    end,
    endPosition,
    secondsAt(position) {
      if (segs.length === 0) return 0
      const x = clamp(typeof position === 'number' ? position : toNumber(position), endPosition)
      const s = find('pos', x)
      return s.sec + (x - s.pos) * s.spw
    },
    positionAt(seconds) {
      if (segs.length === 0) return 0
      const x = clamp(seconds, end)
      const s = find('sec', x)
      return s.pos + (x - s.sec) / s.spw
    },
  }
}
