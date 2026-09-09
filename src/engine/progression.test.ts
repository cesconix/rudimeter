import { describe, expect, it } from 'bun:test'
import { parseExercise } from './exercise'
import { buildGrid } from './grid'
import { judge } from './judge'
import { DEFAULT_AUTO_INCREMENT, nextBpm, repeatAccuracy } from './progression'

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 6 })
const ai = { step: 4, after: 2, minAccuracy: 0.9, maxBpm: 66 }

/** perfect hits on all the repeats < upTo, except the slots listed in `skip` */
const perfect = (upTo: number, skip: number[] = []) =>
  buildGrid(ex, 60, 0)
    .slots.filter((s) => s.repeat < upTo && !skip.includes(s.index))
    .map((s) => ({ t: s.t, peakDb: -20 }))

describe('repeatAccuracy', () => {
  it('counts slots, good+ok and misses of the repeat', () => {
    const grid = buildGrid(ex, 60, 0)
    const r = judge(grid.slots, perfect(1, [3]))
    expect(repeatAccuracy(r.judged, 0)).toEqual({ slots: 8, passing: 7, miss: 1, accuracy: 7 / 8 })
  })

  it('an off lowers the ratio but is not a miss: it only weighs on the denominator', () => {
    const grid = buildGrid(ex, 60, 0)
    const slots = grid.slots.filter((s) => s.repeat === 0)
    // good: offset 0 (≤ goodMs 20). ok: ±30ms (between goodMs 20 and okMs 40). off: ±100ms (> okMs 40,
    // but inside the assignment window dur/2 = 250ms, so assigned to the slot and not an "extra").
    const offsetsMs = [0, 0, 0, 0, 30, -30, 100, -100]
    const hits = slots.map((s, i) => ({ t: s.t + offsetsMs[i] / 1000, peakDb: -20 }))
    const r = judge(slots, hits)
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'good', 'good', 'good', 'ok', 'ok', 'off', 'off'])
    // passing = 4 good + 2 ok = 6; slots = 8 (the two offs count at the denominator, not at the numerator, not as a miss)
    expect(repeatAccuracy(r.judged, 0)).toEqual({ slots: 8, passing: 6, miss: 0, accuracy: 6 / 8 })
  })
})

describe('nextBpm', () => {
  const grid = buildGrid(ex, 60, 0)
  it('before `after` closed repeats: null', () => {
    expect(nextBpm(judge(grid.slots, perfect(1)), grid, 1, ai)).toBeNull()
  })
  it('two clean repeats → +4', () => {
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, ai)).toBe(64)
  })
  it('one miss in the window → null', () => {
    expect(nextBpm(judge(grid.slots, perfect(2, [5])), grid, 2, ai)).toBeNull()
  })
  it('accuracy below threshold because of offs (with no miss) → null', () => {
    const slots = grid.slots.filter((s) => s.repeat === 0)
    const offsetsMs = [0, 0, 0, 0, 30, -30, 100, -100] // good×4, ok×2, off×2 → accuracy 6/8 = 0.75
    const hits = slots.map((s, i) => ({ t: s.t + offsetsMs[i] / 1000, peakDb: -20 }))
    expect(nextBpm(judge(grid.slots, hits), grid, 1, { ...ai, after: 1, minAccuracy: 0.9 })).toBeNull()
  })
  it('respects the ceiling and does not propose the same bpm', () => {
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, { ...ai, step: 10 })).toBe(66)
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, { ...ai, maxBpm: 60 })).toBeNull()
  })
  it('the window must be entirely at the current bpm', () => {
    const mixed = { ...grid, repeats: grid.repeats.map((r, i) => (i === 0 ? { ...r, bpm: 56 } : r)) }
    expect(nextBpm(judge(grid.slots, perfect(2)), mixed, 2, ai)).toBeNull()
  })
  it('on the last repeat there is nothing to raise', () => {
    expect(nextBpm(judge(grid.slots, perfect(6)), grid, 5, ai)).toBeNull()
  })
  it('default: +4 every 4 repeats at 90 %, ceiling 240', () => {
    expect(DEFAULT_AUTO_INCREMENT).toEqual({ step: 4, after: 4, minAccuracy: 0.9, maxBpm: 240 })
  })
})
