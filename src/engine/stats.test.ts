import { describe, expect, it } from 'bun:test'
import { computeStats, mean, sd } from './stats'
import { buildGrid } from './grid'
import { judge } from './judge'
import { parseExercise } from './exercise'
import type { Judged, Slot } from './types'

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
  it('senza accenti: delta null, sotto soglia null (nessun tap con cui confrontare)', () => {
    const s = computeStats(judge(buildGrid(ex, 120, 0).slots, []))
    expect(s.accents).toEqual({ slots: 0, hits: 0, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 })
    expect(s.uniformity.sdDbTaps).toBeNull()
    expect(s.bpmByRepeat).toEqual([])
  })
  it('accenti presenti ma zero taps non accentati: delta e sotto-soglia restano null, non un falso zero', () => {
    // solo gli slot accentati ricevono un colpo: nessun tap a cui confrontarli
    const hits3 = grid.slots.filter((s) => s.step.accent).map((s) => ({ t: s.t, peakDb: -10 }))
    const s = computeStats(judge(grid.slots, hits3))
    expect(s.accents.slots).toBe(4)
    expect(s.accents.hits).toBe(4)
    expect(s.accents.meanDeltaDb).toBeNull()
    expect(s.accents.belowThreshold).toBeNull()
  })
  it('soglia +6 dB esclusiva: un delta di esattamente 6 dB non conta come sotto soglia', () => {
    // tapMean resta -20 (invariato); l'accento all'indice 0 è a -14 dB, cioè +6.0 esatti sopra tapMean
    const hits4 = grid.slots.map((s, i) => ({ t: s.t, peakDb: s.step.accent ? (i === 0 ? -14 : -10) : -20 }))
    const s = computeStats(judge(grid.slots, hits4))
    expect(s.accents.belowThreshold).toBe(0)
  })
})

describe('assorbiti non influenzano la uniformità', () => {
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
  const mkJudged = (slot: Slot, peakDb: number): Judged => ({ slot, hit: { t: slot.t, peakDb }, offsetMs: 0, grade: 'good' })

  it('un colpo assorbito non entra nel calcolo di sdDbTaps, nemmeno con taps reali presenti', () => {
    // due taps non accentati a -18 e -22 dB: sd campionaria = sqrt(((2)^2 + (-2)^2) / 1) = sqrt(8)
    const judged = [mkJudged(mkSlot('R', 0), -18), mkJudged(mkSlot('L', 1), -22)]
    const without = computeStats({ judged, extras: [], absorbed: [] })
    // lo stesso judged, più un colpo assorbito a -5 dB: se filtrasse male, la sd salterebbe vistosamente
    const withAbsorbed = computeStats({ judged, extras: [], absorbed: [{ t: 0.05, peakDb: -5 }] })
    expect(without.uniformity.sdDbTaps).toBeCloseTo(Math.sqrt(8))
    expect(withAbsorbed.uniformity.sdDbTaps).toBe(without.uniformity.sdDbTaps)
    expect(without.absorbed).toBe(0)
    expect(withAbsorbed.absorbed).toBe(1)
  })
})
