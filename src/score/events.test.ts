import { describe, expect, it } from 'bun:test'
import { barLength, flattenVoice, metersOf, voiceLength } from './events'
import { frac } from './fraction'
import type { Event, Score, Voice } from './types'

const snare = (base: 4 | 8 | 16, extra: Partial<Event> = {}): Event => ({
  duration: { base },
  notes: [{ instrument: 'snare' }],
  ...extra,
})

describe('flattenVoice', () => {
  it('gives every event its offset from the bar start and its sounding length', () => {
    const voice: Voice = { stem: 'up', items: [snare(4), snare(8), { duration: { base: 8 }, rest: true }] }
    const flat = flattenVoice(voice)
    expect(flat.map((f) => [f.item, f.offset, f.length])).toEqual([
      [0, frac(0), frac(1, 4)],
      [1, frac(1, 4), frac(1, 8)],
      [2, frac(3, 8), frac(1, 8)],
    ])
    expect(flat[2].event.rest).toBe(true)
    expect(flat.every((f) => f.sub === undefined && f.tuplet === undefined)).toBe(true)
  })

  it('scales the items of a tuplet and numbers them with `sub`', () => {
    const group = { tuplet: { actual: 3, normal: 2 }, items: [snare(8), snare(8), snare(8)] }
    const flat = flattenVoice({ stem: 'up', items: [snare(4), group, snare(4)] })
    expect(flat.map((f) => [f.item, f.sub, f.offset, f.length])).toEqual([
      [0, undefined, frac(0), frac(1, 4)],
      [1, 0, frac(1, 4), frac(1, 12)],
      [1, 1, frac(1, 3), frac(1, 12)],
      [1, 2, frac(5, 12), frac(1, 12)],
      [2, undefined, frac(1, 2), frac(1, 4)],
    ])
    expect(flat[1].tuplet).toBe(group)
  })

  it('sums a voice', () => {
    expect(
      voiceLength({ stem: 'up', items: [snare(4), snare(4), snare(8, { duration: { base: 8, dots: 1 } }), snare(16)] }),
    ).toEqual(frac(3, 4))
  })
})

describe('barLength / metersOf', () => {
  it('turns a meter into whole-note units', () => {
    expect(barLength([4, 4])).toEqual(frac(1))
    expect(barLength([6, 8])).toEqual(frac(3, 4))
    expect(barLength([7, 8])).toEqual(frac(7, 8))
  })
  it('inherits the meter bar by bar, and assumes 4/4 when the first bar has none', () => {
    const score = { bars: [{ meter: [3, 4] }, {}, { meter: [7, 8] }, {}] } as unknown as Score
    expect(metersOf(score)).toEqual([
      [3, 4],
      [3, 4],
      [7, 8],
      [7, 8],
    ])
    expect(metersOf({ bars: [{}, {}] } as unknown as Score)).toEqual([
      [4, 4],
      [4, 4],
    ])
  })
})
