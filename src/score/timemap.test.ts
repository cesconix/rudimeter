import { describe, expect, it } from 'bun:test'
import { frac } from './fraction'
import { beatOf, buildTimeMap, secondsPerWhole } from './timemap'
import type { Bar, Duration, Meter, Score } from './types'
import { unroll } from './unroll'

// The map reads the meter and the playback, never the items: a whole rest stands in for any bar.
const bar = (extra: Partial<Bar> = {}): Bar => ({ ...extra, items: [{ duration: { base: 1 }, rest: true }] })
const score = (bars: Bar[]): Score => ({ id: 't', title: 't', bars })
const map = (bars: Bar[], bpm: number) => {
  const s = score(bars)
  return buildTimeMap(s, unroll(s), bpm)
}

describe('beatOf', () => {
  const BEATS: [Meter, Duration][] = [
    [[2, 4], { base: 4 }],
    [[3, 4], { base: 4 }],
    [[4, 4], { base: 4 }],
    [[2, 2], { base: 2 }],
    [[3, 8], { base: 8 }],
    [[6, 8], { base: 4, dots: 1 }],
    [[9, 8], { base: 4, dots: 1 }],
    [[12, 8], { base: 4, dots: 1 }],
    [[6, 16], { base: 8, dots: 1 }],
  ]
  it.each(BEATS)('%p counts %p', (meter, beat) => {
    expect(beatOf(meter)).toEqual(beat)
  })
})

describe('secondsPerWhole', () => {
  it('is 60 / bpm over the beat the meter counts', () => {
    expect(secondsPerWhole([4, 4], 120)).toBe(2)
    expect(secondsPerWhole([2, 2], 120)).toBe(1)
    expect(secondsPerWhole([3, 8], 120)).toBe(4)
    // ♩. = 120 in 6/8: a dotted quarter is 3/8 of a whole, so a whole lasts 0.5 / (3/8) s.
    expect(secondsPerWhole([6, 8], 120)).toBeCloseTo(4 / 3, 12)
  })
})

describe('buildTimeMap', () => {
  it('is linear under one meter', () => {
    const m = map([bar({ meter: [4, 4] }), bar()], 120)
    expect(m.end).toBe(4)
    expect(m.endPosition).toBe(2)
    expect(m.secondsAt(0)).toBe(0)
    expect(m.secondsAt(frac(1, 4))).toBe(0.5)
    expect(m.secondsAt(1.5)).toBe(3)
    expect(m.positionAt(3)).toBe(1.5)
  })
  it('a bar of 6/8 at 120 is two beats: one second', () => {
    expect(map([bar({ meter: [6, 8] })], 120).end).toBeCloseTo(1, 12)
  })
  it('changes speed where the meter changes: 4/4 then 2/2 at 120', () => {
    // Bar 1: four quarters at 0.5 s, 2 s. Bar 2: two halves at 0.5 s, 1 s.
    const m = map([bar({ meter: [4, 4] }), bar({ meter: [2, 2] })], 120)
    expect(m.end).toBe(3)
    expect(m.secondsAt(1)).toBe(2)
    expect(m.secondsAt(1.5)).toBe(2.5)
    expect(m.positionAt(2.5)).toBe(1.5)
  })
  it('follows the playback order, so a repeated bar is counted twice', () => {
    const m = map([bar({ meter: [2, 4], repeat: { start: true, end: {} } }), bar()], 120)
    expect(m.end).toBe(3)
    expect(m.endPosition).toBe(1.5)
  })
  it('the bpm is the only tempo: the same piece at 60 takes twice as long', () => {
    expect(map([bar({ meter: [4, 4] })], 60).end).toBe(4)
    expect(map([bar({ meter: [4, 4] })], 240).end).toBe(1)
  })
  it('clamps to the piece and inverts within rounding', () => {
    const m = map([bar({ meter: [4, 4] }), bar({ meter: [3, 4] }), bar({ meter: [6, 8] }), bar({ meter: [2, 2] })], 90)
    expect(m.secondsAt(-1)).toBe(0)
    expect(m.secondsAt(99)).toBe(m.end)
    expect(m.positionAt(-1)).toBe(0)
    expect(m.positionAt(99)).toBe(m.endPosition)
    for (let p = 0; p <= m.endPosition; p += 0.125) expect(m.positionAt(m.secondsAt(p))).toBeCloseTo(p, 9)
  })
  it('is empty for an empty playback', () => {
    const m = buildTimeMap(score([bar({ meter: [4, 4] })]), [], 120)
    expect(m.end).toBe(0)
    expect(m.secondsAt(1)).toBe(0)
    expect(m.positionAt(1)).toBe(0)
  })
})
