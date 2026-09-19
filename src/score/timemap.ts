import { barLength, metersOf } from './events'
import { type Fraction, lengthOf, toNumber } from './fraction'
import type { Score, Tempo } from './types'
import type { PlaybackBar } from './unroll'

export interface TimeMap {
  /** playback seconds at a playback position (whole-note units); clamped to the piece */
  secondsAt(position: number | Fraction): number
  /** playback position at a playback second; clamped to the piece */
  positionAt(seconds: number): number
  end: number
  endPosition: number
}

const DEFAULT_TEMPO: Tempo = { bpm: 120, unit: 4 }

/** Seconds one whole note lasts under `t`: 60 / bpm is one beat, and a beat is `unit` (dotted or not) of a whole. */
export function secondsPerWhole(t: Tempo): number {
  const unit = toNumber(lengthOf({ base: t.unit ?? 4, dots: t.dotted ? 1 : 0 }))
  return 60 / t.bpm / unit
}

/** The earliest mark of the piece; 120 to the quarter when there is none. It is what the user's bpm scales. */
export const firstTempo = (score: Score): Tempo => score.bars.find((b) => b.tempo)?.tempo ?? DEFAULT_TEMPO

/** The tempo in force on every written bar: the last mark at or before it; before the first mark, the first mark. */
export function temposOf(score: Score): Tempo[] {
  let current = firstTempo(score)
  return score.bars.map((bar) => {
    if (bar.tempo) current = bar.tempo
    return current
  })
}

interface Segment {
  pos: number
  sec: number
  /** seconds per whole note in this bar */
  spw: number
}

export function buildTimeMap(score: Score, playback: PlaybackBar[], userBpm?: number): TimeMap {
  const meters = metersOf(score)
  const tempos = temposOf(score)
  // The user's bpm names the first mark's speed; every other mark keeps its ratio to it.
  const factor = userBpm === undefined ? 1 : userBpm / firstTempo(score).bpm
  const segs: Segment[] = []
  let pos = 0
  let sec = 0
  for (const pb of playback) {
    const spw = secondsPerWhole(tempos[pb.barIndex]) / factor
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
