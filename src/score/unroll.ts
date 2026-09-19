import { barLength, flattenVoice, metersOf } from './events'
import { add, type Fraction, ZERO } from './fraction'
import { type EventId, playbackKey } from './ids'
import type { Score } from './types'

export interface Section {
  start: number
  end: number
  times: number
}

/**
 * The repeated sections in written order. A section starts at its `repeat.start` or, when a
 * `repeat.end` comes with no start since the previous section, right after that section — books
 * print it that way (50 Workout #43: bars 1–4 repeat, then 5–16 repeat with no sign at bar 5).
 */
export function sections(score: Score): Section[] {
  const out: Section[] = []
  let start = 0
  score.bars.forEach((bar, b) => {
    if (bar.repeat?.start) start = b
    if (bar.repeat?.end) {
      out.push({ start, end: b, times: bar.repeat.end.times ?? 2 })
      start = b + 1
    }
  })
  return out
}

export interface PlaybackBar {
  /** the written bar: `EventId.bar` of its events, the bar the cursor is on */
  barIndex: number
  pass: number
  /** the bar whose events sound: differs from `barIndex` only for a simile bar */
  sourceBarIndex: number
}

/** The written bar a simile bar stands for: the last bar before it that is not itself a simile. */
function sourceOf(score: Score, i: number): number {
  let j = i
  while (j > 0 && score.bars[j].simile) j--
  return j
}

/** The bars in playing order: repeats, endings and simile expanded. */
export function unroll(score: Score): PlaybackBar[] {
  const bars = score.bars
  const out: PlaybackBar[] = []
  let i = 0
  let start = 0
  let pass = 1
  // The last pass of a section has been played (or its `repeat.end` skipped): the endings that
  // follow still filter on `pass`, and the first bar without one opens fresh ground.
  let closed = false
  while (i < bars.length) {
    const bar = bars[i]
    if (bar.repeat?.start && i !== start) {
      start = i
      pass = 1
      closed = false
    } else if (closed && !bar.ending) {
      start = i
      pass = 1
      closed = false
    }
    if (bar.ending && !bar.ending.includes(pass)) {
      if (bar.repeat?.end) closed = true
      i++
      continue
    }
    out.push({ barIndex: i, pass, sourceBarIndex: sourceOf(score, i) })
    if (bar.repeat?.end) {
      if (pass < (bar.repeat.end.times ?? 2)) {
        i = start
        pass++
        continue
      }
      closed = true
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
  hidden: boolean
}

/** Every event of every emitted bar, every part, every voice, in playback order. */
export function eventsOf(score: Score, playback: PlaybackBar[]): PlaybackEvent[] {
  const meters = metersOf(score)
  const out: PlaybackEvent[] = []
  let barStart = ZERO
  for (const pb of playback) {
    const source = score.bars[pb.sourceBarIndex]
    for (const part of score.parts) {
      source.parts?.[part.id]?.voices.forEach((voice, v) => {
        for (const f of flattenVoice(voice)) {
          const id: EventId = { bar: pb.barIndex, part: part.id, voice: v, item: f.item }
          if (f.sub !== undefined) id.sub = f.sub
          out.push({
            id,
            key: playbackKey(id, pb.pass),
            pass: pb.pass,
            position: add(barStart, f.offset),
            length: f.length,
            rest: f.event.rest === true,
            hidden: f.event.hidden === true,
          })
        }
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
