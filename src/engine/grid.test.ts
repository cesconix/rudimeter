import { describe, expect, it } from 'vitest'
import { buildGrid, isSilentBar, repeatAt, replanGrid, slotIndexAt } from './grid'
import { parseExercise } from './exercise'

const stone1 = parseExercise({ id: 's1', name: 's1', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 2 })

describe('buildGrid', () => {
  it('count-in di 1 battuta, poi 8 ottavi × 2 ripetizioni ogni 0.5 s a 60 bpm', () => {
    const g = buildGrid(stone1, 60, 10)
    expect(g.countInEnd).toBeCloseTo(12)
    expect(g.slots).toHaveLength(16)
    expect(g.slots[0].t).toBeCloseTo(12)
    expect(g.slots[15].t).toBeCloseTo(12 + 15 * 0.5)
    expect(g.slots[9]).toMatchObject({ index: 9, repeat: 1, bar: 0, beat: 0, sub: 1 })
    expect(g.slots[5].bar).toBe(1)
    g.slots.forEach((s) => expect(s.dur).toBeCloseTo(0.5))
    expect(g.minStepDur).toBeCloseTo(0.5)
    expect(g.end).toBeCloseTo(20)
    expect(g.repeats.map((r) => r.bpm)).toEqual([60, 60])
    expect(g.repeats[1].start).toBeCloseTo(16)
  })
  it('un click per movimento, count-in incluso, kind bar sul primo movimento della battuta', () => {
    const g = buildGrid(stone1, 120, 0)
    expect(g.countInClicks).toHaveLength(2)
    expect(g.clicks).toHaveLength(2 + 2 * 2 * 2)
    expect(g.clicks[1].t).toBeCloseTo(0.5)
    expect(g.clicks.map((c) => c.kind)).toEqual(['bar', 'beat', 'bar', 'beat', 'bar', 'beat', 'bar', 'beat', 'bar', 'beat'])
    expect(g.clicks.every((c) => !c.silent)).toBe(true)
  })
  it('suddivisioni miste: terzina e semicrome nello stesso esercizio, dur per slot', () => {
    const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    const expected = [0, 1 / 3, 2 / 3, 1, 1.25, 1.5, 1.75]
    g.slots.forEach((s, i) => expect(s.t).toBeCloseTo(expected[i]))
    expect(g.slots[0].dur).toBeCloseTo(1 / 3)
    expect(g.slots[3].dur).toBeCloseTo(0.25)
    expect(g.minStepDur).toBeCloseTo(0.25)
  })
  it('le pause non generano slot ma occupano tempo', () => {
    const ex = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], steps: 'R- L-', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    expect(g.slots.map((s) => s.t)).toEqual([0, 1])
    expect(g.slots.map((s) => s.step.hand)).toEqual(['R', 'L'])
    expect(g.slots.map((s) => s.index)).toEqual([0, 1])
  })
  it('count-in di 0 battute parte subito', () => {
    const g = buildGrid(stone1, 60, 5, { countInBars: 0 })
    expect(g.countInEnd).toBeCloseTo(5)
    expect(g.countInClicks).toEqual([])
  })
  it('click di suddivisione: 2 per movimento, kind sub sugli intermedi', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 2 } })
    expect(g.clicks.slice(0, 4).map((c) => [c.t, c.kind])).toEqual([[0, 'bar'], [0.5, 'sub'], [1, 'beat'], [1.5, 'sub']])
  })
  it('gap training: 1 battuta con click e 1 senza, contando dalla prima dopo il count-in, anche fra ripetizioni', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 1, metronome: { clickSubdivision: 1, gap: { on: 1, off: 1 } } })
    expect(g.countInClicks.every((c) => !c.silent)).toBe(true)
    expect(g.repeats[0].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.repeats[1].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.slots).toHaveLength(16)
  })
})

describe('isSilentBar', () => {
  it('on 2 off 2: battute 0,1 suonano, 2,3 tacciono, 4 suona', () => {
    expect([0, 1, 2, 3, 4].map((b) => isSilentBar(b, { on: 2, off: 2 }))).toEqual([false, false, true, true, false])
  })
  it('senza gap, o con off 0, mai silenziosa', () => {
    expect(isSilentBar(3)).toBe(false)
    expect(isSilentBar(3, { on: 1, off: 0 })).toBe(false)
  })
})

describe('replanGrid', () => {
  it('rifà le ripetizioni da 1 in poi a 120 bpm, tiene la 0, continua gli indici', () => {
    const g = buildGrid(stone1, 60, 0)
    const g2 = replanGrid(g, stone1, 1, 120, { clickSubdivision: 1 })
    expect(g2.repeats[0]).toEqual(g.repeats[0])
    expect(g2.repeats[1].bpm).toBe(120)
    expect(g2.repeats[1].start).toBeCloseTo(g.repeats[0].end)
    expect(g2.repeats[1].end).toBeCloseTo(g.repeats[0].end + 2)
    expect(g2.slots.map((s) => s.index)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(g2.slots[8].dur).toBeCloseTo(0.25)
    expect(g2.end).toBeCloseTo(8)
    expect(g2.countInClicks).toEqual(g.countInClicks)
    expect(g2.clicks).toHaveLength(g.clicks.length)
    expect(g2.minStepDur).toBeCloseTo(0.25)
  })
})

describe('slotIndexAt / repeatAt', () => {
  const g = buildGrid(stone1, 60, 0) // countInEnd 2, uno slot ogni 0.5 s, 16 slot, ripetizioni [2,6) e [6,10)
  it('prima del primo slot: -1, ripetizione 0', () => {
    expect(slotIndexAt(g, 1)).toBe(-1)
    expect(repeatAt(g, 1)).toBe(0)
  })
  it('sullo slot e subito dopo: quello slot', () => {
    expect(slotIndexAt(g, 2)).toBe(0)
    expect(slotIndexAt(g, 2.49)).toBe(0)
    expect(slotIndexAt(g, 7)).toBe(10)
    expect(repeatAt(g, 7)).toBe(1)
    expect(repeatAt(g, 5.99)).toBe(0)
  })
  it('oltre la fine: ultimo slot, ultima ripetizione', () => {
    expect(slotIndexAt(g, 100)).toBe(15)
    expect(repeatAt(g, 100)).toBe(1)
  })
})
