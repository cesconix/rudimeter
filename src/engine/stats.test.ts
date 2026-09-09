import { describe, expect, it } from 'bun:test'
import { parseExercise } from './exercise'
import { buildGrid } from './grid'
import { judge } from './judge'
import { computeStats, mean, sd } from './stats'
import type { Judged, Slot } from './types'

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 10 })

describe('mean/sd', () => {
  it('sample sd of [1,2,3,4] = 1.291', () => {
    expect(sd([1, 2, 3, 4])).toBeCloseTo(1.291, 3)
  })
  it('sd with fewer than 2 values is null, mean of [] is null', () => {
    expect(sd([5])).toBeNull()
    expect(mean([])).toBeNull()
  })
})

describe('computeStats', () => {
  const grid = buildGrid(ex, 120, 0)
  // right on time at −15 dB, left 10 ms late at −21 dB; last repeat skipped
  const hits = grid.slots
    .filter((s) => s.repeat < 9)
    .map((s) => (s.step.hand === 'R' ? { t: s.t, peakDb: -15 } : { t: s.t + 0.01, peakDb: -21 }))
  const stats = computeStats(judge(grid.slots, hits))

  it('counts slots, grades and misses', () => {
    expect(stats.slots).toBe(80)
    expect(stats.good).toBe(72)
    expect(stats.ok).toBe(0)
    expect(stats.miss).toBe(8)
    expect(stats.extras).toBe(0)
  })
  it('splits the hands: left late and quieter', () => {
    // biome-ignore lint/style/noNonNullAssertion: the fixture plays both hands, so R and L are always present in stats.hands.
    const R = stats.hands.find((h) => h.hand === 'R')!
    // biome-ignore lint/style/noNonNullAssertion: the fixture plays both hands, so R and L are always present in stats.hands.
    const L = stats.hands.find((h) => h.hand === 'L')!
    expect(R.slots).toBe(40)
    expect(R.hits).toBe(36)
    expect(R.meanOffsetMs).toBeCloseTo(0)
    expect(L.meanOffsetMs).toBeCloseTo(10)
    expect(R.meanDb).toBeCloseTo(-15)
    expect(L.meanDb).toBeCloseTo(-21)
    expect(L.sdOffsetMs).toBeCloseTo(0)
  })
  it('blocks of 5 repeats: the second one has 8 misses', () => {
    expect(stats.blocks).toHaveLength(2)
    expect(stats.blocks[0]).toMatchObject({ fromRepeat: 0, toRepeat: 4, slots: 40, miss: 0 })
    expect(stats.blocks[1]).toMatchObject({ fromRepeat: 5, toRepeat: 9, slots: 40, miss: 8 })
  })
  it('overall mean offset = 5 ms', () => {
    expect(stats.meanOffsetMs).toBeCloseTo(5)
  })
  it('empty session: all zero and null', () => {
    const s = computeStats({ judged: [], extras: [], absorbed: [] })
    expect(s.slots).toBe(0)
    expect(s.meanOffsetMs).toBeNull()
    expect(s.hands).toEqual([])
    expect(s.blocks).toEqual([])
    expect(s.absorbed).toBe(0)
  })
})

describe('evenness and accents', () => {
  const para = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], steps: '>RLRR >LRLL', repeats: 2 })
  const grid = buildGrid(para, 120, 0)
  // accents at -10 dB, plain strokes at -20 dB, except one weak accent at -17 dB
  const hits = grid.slots.map((s, i) => ({ t: s.t, peakDb: s.step.accent ? (i === 4 ? -17 : -10) : -20 }))
  const stats = computeStats(judge(grid.slots, hits), { bpmByRepeat: [120, 120] })

  it('evenness: σ of the dB of the unaccented strokes only, global and per hand', () => {
    expect(stats.uniformity.sdDbTaps).toBeCloseTo(0)
    expect(stats.uniformity.hands.map((h) => h.hand)).toEqual(['R', 'L'])
    expect(stats.uniformity.hands[0].sdDbTaps).toBeCloseTo(0)
  })
  it('accents: mean delta against the plain strokes and how many below +6 dB', () => {
    expect(stats.accents.slots).toBe(4)
    expect(stats.accents.hits).toBe(4)
    expect(stats.accents.meanDeltaDb).toBeCloseTo(8.25)
    expect(stats.accents.belowThreshold).toBe(1)
    expect(stats.accents.thresholdDb).toBe(6)
  })
  it('reports bpm per repeat and absorbed', () => {
    expect(stats.bpmByRepeat).toEqual([120, 120])
    expect(stats.absorbed).toBe(0)
  })
  it('with no accents: delta null, below threshold null (no tap to compare with)', () => {
    const s = computeStats(judge(buildGrid(ex, 120, 0).slots, []))
    expect(s.accents).toEqual({ slots: 0, hits: 0, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 })
    expect(s.uniformity.sdDbTaps).toBeNull()
    expect(s.bpmByRepeat).toEqual([])
  })
  it('accents present but zero unaccented taps: delta and below-threshold stay null, not a false zero', () => {
    // only the accented slots get a hit: no tap to compare them with
    const hits3 = grid.slots.filter((s) => s.step.accent).map((s) => ({ t: s.t, peakDb: -10 }))
    const s = computeStats(judge(grid.slots, hits3))
    expect(s.accents.slots).toBe(4)
    expect(s.accents.hits).toBe(4)
    expect(s.accents.meanDeltaDb).toBeNull()
    expect(s.accents.belowThreshold).toBeNull()
  })
  it('exclusive +6 dB threshold: a delta of exactly 6 dB does not count as below threshold', () => {
    // tapMean stays -20 (unchanged); the accent at index 0 is at -14 dB, that is exactly +6.0 above tapMean
    const hits4 = grid.slots.map((s, i) => ({ t: s.t, peakDb: s.step.accent ? (i === 0 ? -14 : -10) : -20 }))
    const s = computeStats(judge(grid.slots, hits4))
    expect(s.accents.belowThreshold).toBe(0)
  })
})

describe('absorbed hits do not affect the evenness', () => {
  const mkSlot = (hand: 'R' | 'L', index: number): Slot => ({
    index,
    t: index,
    dur: 0.1,
    step: { hand, accent: false },
    repeat: 0,
    bar: 0,
    beat: 0,
    sub: index,
  })
  const mkJudged = (slot: Slot, peakDb: number): Judged => ({
    slot,
    hit: { t: slot.t, peakDb },
    offsetMs: 0,
    grade: 'good',
  })

  it('an absorbed hit does not enter the sdDbTaps computation, not even with real taps present', () => {
    // two unaccented taps at -18 and -22 dB: sample sd = sqrt(((2)^2 + (-2)^2) / 1) = sqrt(8)
    const judged = [mkJudged(mkSlot('R', 0), -18), mkJudged(mkSlot('L', 1), -22)]
    const without = computeStats({ judged, extras: [], absorbed: [] })
    // the same judged, plus an absorbed hit at -5 dB: if it filtered badly, the sd would jump visibly
    const withAbsorbed = computeStats({ judged, extras: [], absorbed: [{ t: 0.05, peakDb: -5 }] })
    expect(without.uniformity.sdDbTaps).toBeCloseTo(Math.sqrt(8))
    expect(withAbsorbed.uniformity.sdDbTaps).toBe(without.uniformity.sdDbTaps)
    expect(without.absorbed).toBe(0)
    expect(withAbsorbed.absorbed).toBe(1)
  })
})
