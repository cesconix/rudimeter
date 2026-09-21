import { add, type Fraction, frac, lengthOf, mul, ZERO } from './fraction'
import { type Bar, type Event, isTuplet, type Meter, type Score, type TupletGroup } from './types'

export interface FlatEvent {
  event: Event
  /** index in `Bar.items` */
  item: number
  /** position inside the tuplet group, when the item is one */
  sub?: number
  /** from the bar start, whole-note units */
  offset: Fraction
  /** sounding length: the written value scaled by the tuplet, if any */
  length: Fraction
  tuplet?: TupletGroup
}

/** The events of a bar in order, tuplets opened, each with where it starts and how long it sounds. */
export function flattenBar(bar: Bar): FlatEvent[] {
  const out: FlatEvent[] = []
  let offset = ZERO
  bar.items.forEach((item, i) => {
    if (isTuplet(item)) {
      // Three eighths in the time of two: every item is worth 2/3 of what is written.
      const factor = frac(item.tuplet.normal, item.tuplet.actual)
      item.items.forEach((event: Event, sub) => {
        const length = mul(lengthOf(event.duration), factor)
        out.push({ event, item: i, sub, offset, length, tuplet: item })
        offset = add(offset, length)
      })
    } else {
      const length = lengthOf(item.duration)
      out.push({ event: item, item: i, offset, length })
      offset = add(offset, length)
    }
  })
  return out
}

export const barLength = (meter: Meter): Fraction => frac(meter[0], meter[1])

/**
 * The meter in force on every bar. A first bar without one is a validation error; here it is read
 * as 4/4 so that the callers that run before or alongside validation (the sums, the time map) still
 * have a number to work with instead of a crash.
 */
export function metersOf(score: Score): Meter[] {
  let current: Meter = score.bars[0]?.meter ?? [4, 4]
  return score.bars.map((bar) => {
    if (bar.meter) current = bar.meter
    return current
  })
}
