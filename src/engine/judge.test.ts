import { describe, expect, it } from 'bun:test'
import { parseExercise } from './exercise'
import { buildGrid } from './grid'
import { isAbsorbed, judge } from './judge'
import type { Slot, Step } from './types'

const step = { hand: 'R' as const, accent: false }
const slotsAt = (times: number[], dur = 0.5): Slot[] =>
  times.map((t, index) => ({ index, t, dur, step, repeat: 0, bar: 0, beat: index, sub: 0 }))
const hit = (t: number, peakDb = -20) => ({ t, peakDb })

describe('judge', () => {
  const slots = slotsAt([1, 1.5, 2, 2.5])

  it('assigns every hit to the nearest slot and computes the offset in ms', () => {
    const r = judge(slots, [hit(1.01), hit(1.47), hit(2.0)])
    expect(r.judged[0].offsetMs).toBeCloseTo(10)
    expect(r.judged[1].offsetMs).toBeCloseTo(-30)
    expect(r.judged[2].offsetMs).toBeCloseTo(0)
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'good', 'miss'])
    expect(r.extras).toEqual([])
  })

  it('grade at the edges: 20 ms is good, 20.5 is ok, 40 is ok, 41 is off', () => {
    const r = judge(slotsAt([1, 2, 3, 4], 1), [hit(1.02), hit(2.0205), hit(3.04), hit(4.041)])
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'ok', 'off'])
  })

  it('a hit outside every window is an extra and does not touch the slots', () => {
    const r = judge(slots, [hit(3.0)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged.every((j) => j.grade === 'miss')).toBe(true)
  })

  it('two hits on the same slot: the nearest one wins, the other is an extra', () => {
    const r = judge(slots, [hit(1.1), hit(0.98)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('two hits on the same slot, the nearest comes first: the second (farther) does not evict it', () => {
    const r = judge(slots, [hit(0.98), hit(1.1)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('with now, the slots whose window is still open are pending, not miss', () => {
    const r = judge(slots, [hit(1.0)], { now: 1.6 })
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'pending', 'pending', 'pending'])
  })

  it('positive offset = late', () => {
    const r = judge(slotsAt([1], 1), [hit(1.03)])
    expect(r.judged[0].offsetMs).toBeGreaterThan(0)
  })

  it('custom windows', () => {
    const r = judge(slotsAt([1], 1), [hit(1.015)], { windows: { goodMs: 10, okMs: 30 } })
    expect(r.judged[0].grade).toBe('ok')
  })

  it('no slots: everything is an extra', () => {
    const r = judge([], [hit(1)])
    expect(r.extras).toHaveLength(1)
  })

  it('the window is per slot: a short slot does not take a hit that a long one would take', () => {
    const slots: Slot[] = [
      { index: 0, t: 0, dur: 1, step, repeat: 0, bar: 0, beat: 0, sub: 0 },
      { index: 1, t: 1, dur: 0.25, step, repeat: 0, bar: 0, beat: 1, sub: 0 },
    ]
    expect(judge(slots, [hit(0.9)]).judged[1].offsetMs).toBeCloseTo(-100)
    expect(judge(slots, [hit(0.8)]).extras).toHaveLength(1)
  })
})

describe('the window is per slot: the real gap between triplet and sixteenth', () => {
  // same exercise as the "mixed subdivisions" test in grid.test.ts: 'RLR LRLR' in 2/4 at 60 bpm.
  // slot[2]: t=2/3, dur=1/3 → window [1/2, 5/6≈0.8333]. slot[3]: t=1, dur=0.25 → window [0.875, 1.125].
  // between the two windows a gap (0.8333, 0.875) of ~42 ms is left: the order of magnitude of the good/ok
  // thresholds, right where the real hits of a drummer land.
  const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
  const grid = buildGrid(ex, 60, 0, { countInBars: 0 })

  it('a hit in the gap is taken by neither of the two neighboring slots: extra', () => {
    const r = judge(grid.slots, [hit(0.85)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged[2].hit).toBeNull()
    expect(r.judged[3].hit).toBeNull()
  })

  it('hits just inside each neighboring window are taken, not extras', () => {
    const r = judge(grid.slots, [hit(0.82), hit(0.88)])
    expect(r.judged[2].hit?.t).toBe(0.82)
    expect(r.judged[3].hit?.t).toBe(0.88)
    expect(r.extras).toHaveLength(0)
  })
})

const withOrnament = (ornament: Step['ornament']): Step => ({ hand: 'R', accent: false, ornament, graceHand: 'L' })
const slot = (index: number, t: number, dur: number, s: Step = step): Slot => ({
  index,
  t,
  dur,
  step: s,
  repeat: 0,
  bar: 0,
  beat: index,
  sub: 0,
})

describe('extras absorbed by the ornaments', () => {
  it('flam: a hit up to 60 ms before the main one is the grace note', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('flam')), slot(1, 1.5, 0.5)]
    const r = judge(slots, [hit(0.96), hit(1.0), hit(1.5)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[0].grade).toBe('good')
    expect(r.absorbed.map((h) => h.t)).toEqual([0.96])
    expect(r.extras).toEqual([])
  })
  it('flam: more than 60 ms before, it stays an extra', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('flam'))]
    const r = judge(slots, [hit(0.93), hit(1.0)])
    expect(r.extras.map((h) => h.t)).toEqual([0.93])
    expect(r.absorbed).toEqual([])
  })
  it('flam: a single hit, even an early one, is the main one (it is not absorbed)', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('flam'))], [hit(0.95)])
    expect(r.judged[0].offsetMs).toBeCloseTo(-50)
    expect(r.absorbed).toEqual([])
  })
  it('drag: same rule as the flam', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('drag'))], [hit(0.95), hit(0.97), hit(1.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.absorbed).toHaveLength(2)
  })
  it('with no ornament a hit before stays an extra', () => {
    const r = judge([slot(0, 1, 0.5)], [hit(0.96), hit(1.0)])
    expect(r.extras.map((h) => h.t)).toEqual([0.96])
  })
  it('buzz: the bounces inside the slot duration are absorbed, even if stolen from the next slot', () => {
    const slots = [slot(0, 1, 1, withOrnament('buzz')), slot(1, 2, 1)]
    const r = judge(slots, [hit(1.0), hit(1.05), hit(1.1), hit(1.9), hit(2.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[1].hit?.t).toBe(2.0)
    expect(r.absorbed.map((h) => h.t)).toEqual([1.05, 1.1, 1.9])
    expect(r.extras).toEqual([])
  })
  it('buzz: a hit after the end of the slot is not absorbed', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('buzz'))]
    const r = judge(slots, [hit(1.0), hit(1.6)])
    expect(r.extras.map((h) => h.t)).toEqual([1.6])
  })
  it('tremolo: like the buzz', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('tremolo'))], [hit(1.0), hit(1.2)])
    expect(r.absorbed.map((h) => h.t)).toEqual([1.2])
  })
  it('isAbsorbed is exposed for the integration tests (it requires the claim on the ornamented slot)', () => {
    expect(isAbsorbed([slot(0, 1, 0.5, withOrnament('flam'))], hit(0.95), new Set([0]))).toBe(true)
    expect(isAbsorbed([slot(0, 1, 0.5, withOrnament('flam'))], hit(0.95), new Set())).toBe(false)
    expect(isAbsorbed([slot(0, 1, 0.5)], hit(0.95), new Set([0]))).toBe(false)
  })
})

describe('absorption: it requires the main hit, and does not rob the previous slot if it is a miss (Ruling 3)', () => {
  it('late hit before a fast flam: the previous slot stays a miss, the hit stays its evidence (reviewer scenario)', () => {
    // Literal reviewer scenario, with no adapted numbers: 240 bpm, sixteenths (62.5 ms), ordinary slot
    // at t=1.0, flam at t=1.0625. The previous note arrives 40 ms late (t=1.04): it is nearer to the flam (22.5 ms)
    // than to its own slot (40 ms), so during the assignment it is a candidate for the flam — and is then evicted
    // by the real hit of the flam (t=1.0655, almost on time). The previous slot never gets a candidate: it stays
    // a miss. Without condition 4 that extra (only 22.5 ms from the flam, well inside the 60 ms) would be
    // absorbed as a grace note, erasing the only evidence of the miss. With condition 4 the previous slot
    // is an unassigned miss → absorption is blocked, the hit stays visible in extras next to the miss.
    const prev = slot(0, 1.0, 0.0625, step)
    const flamSlot = slot(1, 1.0625, 0.0625, withOrnament('flam'))
    const r = judge([prev, flamSlot], [hit(1.04), hit(1.0655)])
    expect(r.judged[0].grade).toBe('miss')
    expect(r.judged[0].hit).toBeNull()
    expect(r.judged[1].hit?.t).toBe(1.0655)
    expect(r.judged[1].grade).toBe('good')
    expect(r.extras.map((h) => h.t)).toEqual([1.04])
    expect(r.absorbed).toEqual([])
  })

  it('normal case: previous slot assigned, flam assigned, grace note 40 ms before → absorbed', () => {
    const prev = slot(0, 1, 0.5, step)
    const flamSlot = slot(1, 1.5, 0.5, withOrnament('flam'))
    const r = judge([prev, flamSlot], [hit(1.0), hit(1.46), hit(1.5)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[1].hit?.t).toBe(1.5)
    expect(r.absorbed.map((h) => h.t)).toEqual([1.46])
    expect(r.extras).toEqual([])
  })

  it('flam at the start of the grid, no previous slot: condition 4 is vacuously true, grace note absorbed', () => {
    const flamSlot = slot(0, 1, 0.5, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.96), hit(1.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.absorbed.map((h) => h.t)).toEqual([0.96])
    expect(r.extras).toEqual([])
  })

  it('flam skipped: the slot stays a miss and the stray hit before it stays an extra, not absorbed', () => {
    const flamSlot = slot(0, 1, 0.06, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.95)])
    expect(r.judged[0].grade).toBe('miss')
    expect(r.judged[0].hit).toBeNull()
    expect(r.extras.map((h) => h.t)).toEqual([0.95])
    expect(r.absorbed).toEqual([])
  })

  it('exact 60 ms boundary: inside (edge included) it is absorbed, just outside it stays an extra', () => {
    // No previous slot: condition 4 is vacuous, the only threshold in play is ABSORB_BEFORE_S = 60 ms.
    // Slot window (100 ms → 50 ms) narrower than all the offsets below, so the three hits become
    // extras straight away, without competing with the main hit.
    const flamSlot = slot(0, 0.5, 0.1, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.439), hit(0.44), hit(0.441), hit(0.5)])
    expect(r.judged[0].hit?.t).toBe(0.5)
    expect(r.absorbed.map((h) => h.t)).toEqual([0.44, 0.441]) // exactly 60 ms and 59 ms: inside
    expect(r.extras.map((h) => h.t)).toEqual([0.439]) // 61 ms: outside
  })

  it('buzz: the exact edges of the duration are outside, open interval (slot.t, slot.t + dur)', () => {
    const s = [slot(0, 1, 0.5, withOrnament('buzz'))]
    const claimed = new Set([0])
    expect(isAbsorbed(s, hit(1), claimed)).toBe(false) // exactly slot.t: not inside yet
    expect(isAbsorbed(s, hit(1.5), claimed)).toBe(false) // exactly slot.t + dur: already outside
    expect(isAbsorbed(s, hit(1.25), claimed)).toBe(true) // halfway: inside, sanity check
  })
})
