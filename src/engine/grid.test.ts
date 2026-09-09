import { describe, expect, it } from 'bun:test'
import { parseExercise } from './exercise'
import { buildGrid, isSilentBar, repeatAt, replanGrid, slotIndexAt } from './grid'

const stone1 = parseExercise({ id: 's1', name: 's1', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 2 })

describe('buildGrid', () => {
  it('1-bar count-in, then 8 eighths × 2 repeats every 0.5 s at 60 bpm', () => {
    const g = buildGrid(stone1, 60, 10)
    expect(g.countInEnd).toBeCloseTo(12, 6)
    expect(g.slots).toHaveLength(16)
    expect(g.slots[0].t).toBeCloseTo(12, 6)
    expect(g.slots[15].t).toBeCloseTo(12 + 15 * 0.5, 6)
    expect(g.slots[9]).toMatchObject({ index: 9, repeat: 1, bar: 0, beat: 0, sub: 1 })
    expect(g.slots[5].bar).toBe(1)
    g.slots.forEach((s) => {
      expect(s.dur).toBeCloseTo(0.5, 6)
    })
    expect(g.minStepDur).toBeCloseTo(0.5, 6)
    expect(g.end).toBeCloseTo(20, 6)
    expect(g.repeats.map((r) => r.bpm)).toEqual([60, 60])
    expect(g.repeats[1].start).toBeCloseTo(16, 6)
  })
  it('one click per beat, count-in included, kind bar on the first beat of the bar', () => {
    const g = buildGrid(stone1, 120, 0)
    expect(g.countInClicks).toHaveLength(2)
    expect(g.clicks).toHaveLength(2 + 2 * 2 * 2)
    expect(g.clicks[1].t).toBeCloseTo(0.5, 6)
    expect(g.clicks.map((c) => c.kind)).toEqual([
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
    ])
    expect(g.clicks.every((c) => !c.silent)).toBe(true)
  })
  it('mixed subdivisions: triplet and sixteenths in the same exercise, dur per slot', () => {
    const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    const expected = [0, 1 / 3, 2 / 3, 1, 1.25, 1.5, 1.75]
    g.slots.forEach((s, i) => {
      expect(s.t).toBeCloseTo(expected[i], 6)
    })
    expect(g.slots[0].dur).toBeCloseTo(1 / 3, 6)
    expect(g.slots[3].dur).toBeCloseTo(0.25, 6)
    expect(g.minStepDur).toBeCloseTo(0.25, 6)
  })
  it('rests generate no slot but take up time', () => {
    const ex = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], steps: 'R- L-', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    expect(g.slots.map((s) => s.t)).toEqual([0, 1])
    expect(g.slots.map((s) => s.step.hand)).toEqual(['R', 'L'])
    expect(g.slots.map((s) => s.index)).toEqual([0, 1])
  })
  it('a 0-bar count-in starts right away', () => {
    const g = buildGrid(stone1, 60, 5, { countInBars: 0 })
    expect(g.countInEnd).toBeCloseTo(5, 6)
    expect(g.countInClicks).toEqual([])
  })
  it('2-bar count-in', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 2 })
    expect(g.countInEnd).toBeCloseTo(4, 6)
    expect(g.countInClicks).toHaveLength(4)
    expect(g.countInClicks.map((c) => c.kind)).toEqual(['bar', 'beat', 'bar', 'beat'])
  })
  it('subdivision clicks: 2 per beat, kind sub on the in-between ones', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 2 } })
    expect(g.clicks.slice(0, 4).map((c) => [c.t, c.kind])).toEqual([
      [0, 'bar'],
      [0.5, 'sub'],
      [1, 'beat'],
      [1.5, 'sub'],
    ])
  })
  it('subdivision clicks: 3 per beat, kind sub on the two in-between ones', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 3 } })
    const first6 = g.clicks.slice(0, 6)
    expect(first6.map((c) => c.kind)).toEqual(['bar', 'sub', 'sub', 'beat', 'sub', 'sub'])
    const expectedT = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3]
    first6.forEach((c, i) => {
      expect(c.t).toBeCloseTo(expectedT[i], 6)
    })
  })
  it('subdivision clicks: 4 per beat, kind sub on the three in-between ones', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 4 } })
    const first4 = g.clicks.slice(0, 4)
    expect(first4.map((c) => c.kind)).toEqual(['bar', 'sub', 'sub', 'sub'])
    const expectedT = [0, 0.25, 0.5, 0.75]
    first4.forEach((c, i) => {
      expect(c.t).toBeCloseTo(expectedT[i], 6)
    })
  })
  it('gap training: 1 bar with click and 1 without, counting from the first after the count-in, across repeats too', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 1, metronome: { clickSubdivision: 1, gap: { on: 1, off: 1 } } })
    expect(g.countInClicks.every((c) => !c.silent)).toBe(true)
    expect(g.repeats[0].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.repeats[1].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.slots).toHaveLength(16)
  })
})

describe('isSilentBar', () => {
  it('on 2 off 2: bars 0,1 sound, 2,3 are silent, 4 sounds', () => {
    expect([0, 1, 2, 3, 4].map((b) => isSilentBar(b, { on: 2, off: 2 }))).toEqual([false, false, true, true, false])
  })
  it('with no gap, or with off 0 or on 0, never silent', () => {
    expect(isSilentBar(3)).toBe(false)
    expect(isSilentBar(3, { on: 1, off: 0 })).toBe(false)
    expect(isSilentBar(3, { on: 0, off: 2 })).toBe(false)
  })
})

describe('replanGrid', () => {
  it('redoes the repeats from 1 on at 120 bpm, keeps 0, continues the indices', () => {
    const g = buildGrid(stone1, 60, 0)
    const g2 = replanGrid(g, stone1, 1, 120, { clickSubdivision: 1 })
    expect(g2.repeats[0]).toEqual(g.repeats[0])
    expect(g2.repeats[1].bpm).toBe(120)
    // direct assignment in the code (start = kept[last].end passed to buildRepeat): bit-for-bit
    expect(g2.repeats[1].start).toBe(g.repeats[0].end)
    expect(g2.repeats[1].end).toBeCloseTo(g.repeats[0].end + 2, 6)
    expect(g2.slots.map((s) => s.index)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(g2.slots[8].dur).toBeCloseTo(0.25, 6)
    expect(g2.end).toBeCloseTo(8, 6)
    expect(g2.countInClicks).toEqual(g.countInClicks)
    expect(g2.clicks).toHaveLength(g.clicks.length)
    expect(g2.minStepDur).toBeCloseTo(0.25, 6)
    // the repeat redone at 120 bpm: a click every 0.5 s (no longer 1 s), not just the count
    expect(g2.repeats[1].clicks.map((c) => [c.t, c.kind])).toEqual([
      [6, 'bar'],
      [6.5, 'beat'],
      [7, 'bar'],
      [7.5, 'beat'],
    ])
  })
})

describe('slotIndexAt / repeatAt', () => {
  const g = buildGrid(stone1, 60, 0) // countInEnd 2, one slot every 0.5 s, 16 slots, repeats [2,6) and [6,10)
  it('before the first slot: -1, repeat 0', () => {
    expect(slotIndexAt(g, 1)).toBe(-1)
    expect(repeatAt(g, 1)).toBe(0)
  })
  it('on the slot and right after: that slot', () => {
    expect(slotIndexAt(g, 2)).toBe(0)
    expect(slotIndexAt(g, 2.49)).toBe(0)
    expect(slotIndexAt(g, 7)).toBe(10)
    expect(repeatAt(g, 7)).toBe(1)
    expect(repeatAt(g, 5.99)).toBe(0)
  })
  it('past the end: last slot, last repeat', () => {
    expect(slotIndexAt(g, 100)).toBe(15)
    expect(repeatAt(g, 100)).toBe(1)
  })
})

describe('guide sound', () => {
  // Exercise with an accent and a rest: the guide must follow the NOTES, not the beats.
  const mixed = parseExercise({ id: 'g', name: 'g', timeSignature: [2, 4], steps: '>RL R- | RL RL', repeats: 1 })

  it('off by default: the queue holds metronome clicks only', () => {
    const g = buildGrid(mixed, 60, 0)
    expect(g.clicks.some((c) => c.kind === 'note' || c.kind === 'note-accent')).toBe(false)
  })

  it('on: one event on every note, at its very instant, accented where the note is', () => {
    const g = buildGrid(mixed, 60, 0, { metronome: { clickSubdivision: 1, guide: true } })
    const guide = g.clicks.filter((c) => c.kind === 'note' || c.kind === 'note-accent')
    // Seven notes: the rest in the second beat produces nothing, just as it produces no slot.
    expect(guide).toHaveLength(g.slots.length)
    expect(guide.map((c) => c.t)).toEqual(g.slots.map((s) => s.t))
    expect(guide.map((c) => c.kind)).toEqual(g.slots.map((s) => (s.step.accent ? 'note-accent' : 'note')))
  })

  it('in the muted bars of the gap it is silent like the click, otherwise gap training would not exist', () => {
    const g = buildGrid(mixed, 60, 0, { metronome: { clickSubdivision: 1, guide: true, gap: { on: 1, off: 1 } } })
    const guide = g.clicks.filter((c) => c.kind === 'note' || c.kind === 'note-accent')
    // Bar 0 sounds, bar 1 is silent: the guide has the same `silent` as the slot that generated it.
    expect(guide.filter((c) => !c.silent).map((c) => c.t)).toEqual(g.slots.filter((s) => s.bar === 0).map((s) => s.t))
    expect(guide.filter((c) => c.silent).map((c) => c.t)).toEqual(g.slots.filter((s) => s.bar === 1).map((s) => s.t))
  })

  it('survives the bpm change: the redone repeats carry it over', () => {
    const two = parseExercise({ id: 'g2', name: 'g2', timeSignature: [2, 4], steps: 'RL RL', repeats: 2 })
    const metro = { clickSubdivision: 1 as const, guide: true }
    const g = buildGrid(two, 60, 0, { metronome: metro })
    const g2 = replanGrid(g, two, 1, 120, metro)
    const guide = g2.repeats[1].clicks.filter((c) => c.kind === 'note')
    expect(guide.map((c) => c.t)).toEqual(g2.repeats[1].slots.map((s) => s.t))
  })
})
