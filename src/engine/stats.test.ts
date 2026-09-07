import { describe, expect, it } from 'vitest'
import { computeStats, mean, sd } from './stats'
import { buildGrid } from './grid'
import { judge } from './judge'
import { parseExercise } from './exercise'

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 10 })

describe('mean/sd', () => {
  it('sd campionaria di [1,2,3,4] = 1.291', () => {
    expect(sd([1, 2, 3, 4])).toBeCloseTo(1.291, 3)
  })
  it('sd con meno di 2 valori è null, mean di [] è null', () => {
    expect(sd([5])).toBeNull()
    expect(mean([])).toBeNull()
  })
})

describe('computeStats', () => {
  const grid = buildGrid(ex, 120, 0)
  // destra puntuale a −15 dB, sinistra 10 ms in ritardo a −21 dB; ultima ripetizione saltata
  const hits = grid.slots
    .filter((s) => s.repeat < 9)
    .map((s) => (s.step.hand === 'R' ? { t: s.t, peakDb: -15 } : { t: s.t + 0.01, peakDb: -21 }))
  const stats = computeStats(judge(grid.slots, hits))

  it('conta slot, grade e miss', () => {
    expect(stats.slots).toBe(80)
    expect(stats.good).toBe(72)
    expect(stats.ok).toBe(0)
    expect(stats.miss).toBe(8)
    expect(stats.extras).toBe(0)
  })
  it('separa le mani: sinistra in ritardo e più piano', () => {
    const R = stats.hands.find((h) => h.hand === 'R')!
    const L = stats.hands.find((h) => h.hand === 'L')!
    expect(R.slots).toBe(40)
    expect(R.hits).toBe(36)
    expect(R.meanOffsetMs).toBeCloseTo(0)
    expect(L.meanOffsetMs).toBeCloseTo(10)
    expect(R.meanDb).toBeCloseTo(-15)
    expect(L.meanDb).toBeCloseTo(-21)
    expect(L.sdOffsetMs).toBeCloseTo(0)
  })
  it('blocchi da 5 ripetizioni: il secondo ha 8 miss', () => {
    expect(stats.blocks).toHaveLength(2)
    expect(stats.blocks[0]).toMatchObject({ fromRepeat: 0, toRepeat: 4, slots: 40, miss: 0 })
    expect(stats.blocks[1]).toMatchObject({ fromRepeat: 5, toRepeat: 9, slots: 40, miss: 8 })
  })
  it('media offset complessiva = 5 ms', () => {
    expect(stats.meanOffsetMs).toBeCloseTo(5)
  })
  it('sessione vuota: tutto zero e null', () => {
    const s = computeStats({ judged: [], extras: [], absorbed: [] })
    expect(s.slots).toBe(0)
    expect(s.meanOffsetMs).toBeNull()
    expect(s.hands).toEqual([])
    expect(s.blocks).toEqual([])
    expect(s.absorbed).toBe(0)
  })
})

describe('uniformità e accenti', () => {
  const para = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], steps: '>RLRR >LRLL', repeats: 2 })
  const grid = buildGrid(para, 120, 0)
  // accenti a -10 dB, colpi normali a -20 dB, tranne un accento fiacco a -17 dB
  const hits = grid.slots.map((s, i) => ({ t: s.t, peakDb: s.step.accent ? (i === 4 ? -17 : -10) : -20 }))
  const stats = computeStats(judge(grid.slots, hits), { bpmByRepeat: [120, 120] })

  it('uniformità: σ dei dB dei soli colpi non accentati, globale e per mano', () => {
    expect(stats.uniformity.sdDbTaps).toBeCloseTo(0)
    expect(stats.uniformity.hands.map((h) => h.hand)).toEqual(['R', 'L'])
    expect(stats.uniformity.hands[0].sdDbTaps).toBeCloseTo(0)
  })
  it('accenti: delta medio rispetto ai colpi normali e quanti sotto +6 dB', () => {
    expect(stats.accents.slots).toBe(4)
    expect(stats.accents.hits).toBe(4)
    expect(stats.accents.meanDeltaDb).toBeCloseTo(8.25)
    expect(stats.accents.belowThreshold).toBe(1)
    expect(stats.accents.thresholdDb).toBe(6)
  })
  it('riporta bpm per ripetizione e assorbiti', () => {
    expect(stats.bpmByRepeat).toEqual([120, 120])
    expect(stats.absorbed).toBe(0)
  })
  it('senza accenti: delta null, zero sotto soglia', () => {
    const s = computeStats(judge(buildGrid(ex, 120, 0).slots, []))
    expect(s.accents).toEqual({ slots: 0, hits: 0, meanDeltaDb: null, belowThreshold: 0, thresholdDb: 6 })
    expect(s.uniformity.sdDbTaps).toBeNull()
    expect(s.bpmByRepeat).toEqual([])
  })
})
