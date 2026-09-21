import { describe, expect, it } from 'bun:test'
import { beamGroups, resolveBeams } from './beaming'
import { flattenBar } from './events'
import { frac } from './fraction'
import type { Event, Item, Meter } from './types'

const n = (base: 4 | 8 | 16, extra: Partial<Event> = {}): Event => ({ duration: { base }, ...extra })
const r = (base: 4 | 8 | 16): Event => ({ duration: { base }, rest: true })
const marks = (meter: Meter, items: Item[], beams?: number[]) => resolveBeams(meter, beams, flattenBar({ items }))

describe('beamGroups', () => {
  it('is one beat per group on quarter and half denominators', () => {
    expect(beamGroups([4, 4])).toEqual([frac(1, 4), frac(1, 4), frac(1, 4), frac(1, 4)])
    expect(beamGroups([3, 4])).toHaveLength(3)
    expect(beamGroups([2, 2])).toEqual([frac(1, 2), frac(1, 2)])
  })
  it('groups eighths in threes when the numerator allows, else in twos with a final three', () => {
    expect(beamGroups([6, 8])).toEqual([frac(3, 8), frac(3, 8)])
    expect(beamGroups([12, 8])).toHaveLength(4)
    expect(beamGroups([7, 8])).toEqual([frac(2, 8), frac(2, 8), frac(3, 8)])
    expect(beamGroups([5, 8])).toEqual([frac(2, 8), frac(3, 8)])
    expect(beamGroups([4, 8])).toEqual([frac(2, 8), frac(2, 8)])
    expect(beamGroups([1, 8])).toEqual([frac(1, 8)])
  })
  it('takes the bar override as it is', () => {
    expect(beamGroups([7, 8], [3, 2, 2])).toEqual([frac(3, 8), frac(2, 8), frac(2, 8)])
  })
})

describe('resolveBeams', () => {
  it('beams eighths beat by beat in 4/4 and leaves quarters alone', () => {
    expect(marks([4, 4], [n(8), n(8), n(4), n(8), n(8), n(16), n(16), n(16), n(16)])).toEqual([
      'begin',
      'end',
      null,
      'begin',
      'end',
      'begin',
      'continue',
      'continue',
      'end',
    ])
  })
  it('keeps a rest at the edge of a group outside the beam and beams over one inside', () => {
    expect(marks([2, 4], [r(16), n(16), n(16), n(16), n(16), n(16), n(16), r(16)])).toEqual([
      null,
      'begin',
      'continue',
      'end',
      'begin',
      'continue',
      'end',
      null,
    ])
    expect(marks([1, 4], [n(16), r(16), n(16), n(16)])).toEqual(['begin', 'continue', 'continue', 'end'])
  })
  it('gives flags to a group with fewer than two notes', () => {
    expect(marks([2, 4], [r(8), n(8), n(8), r(8)])).toEqual([null, null, null, null])
  })
  it('a quarter splits the group: nothing beams across it', () => {
    expect(marks([2, 4], [n(8), n(4), n(8)])).toEqual([null, null, null])
  })
  it('beams a tuplet as one unit', () => {
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] }
    expect(marks([1, 4], [triplet])).toEqual(['begin', 'continue', 'end'])
  })
  it('keeps a tuplet whole when it straddles the beat groups, and out of its neighbours beams', () => {
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] }
    // 1/8 + 1/4 + 1/8: the triplet starts halfway through beat 1 and ends halfway through beat 2.
    expect(marks([2, 4], [n(8), triplet, n(8)])).toEqual([null, 'begin', 'continue', 'end', null])
    // 1/4 + 1/8 + 1/8 + 1/4 + 1/4: the two eighths beam on beat 2, the triplet on its own.
    expect(marks([4, 4], [n(4), n(8), n(8), triplet, n(4)])).toEqual([
      null,
      'begin',
      'end',
      'begin',
      'continue',
      'end',
      null,
    ])
  })
  it('leaves a quarter-note triplet unbeamed', () => {
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [n(4), n(4), n(4)] }
    expect(marks([2, 4], [triplet])).toEqual([null, null, null])
  })
  it('follows the bar override', () => {
    const eighths = Array.from({ length: 7 }, () => n(8))
    expect(marks([7, 8], eighths, [3, 2, 2])).toEqual(['begin', 'continue', 'end', 'begin', 'end', 'begin', 'end'])
  })
  it('passes explicit marks through untouched, including the gaps', () => {
    expect(marks([2, 4], [n(8, { beam: 'begin' }), n(8, { beam: 'continue' }), n(8, { beam: 'end' }), n(8)])).toEqual([
      'begin',
      'continue',
      'end',
      null,
    ])
  })
})
