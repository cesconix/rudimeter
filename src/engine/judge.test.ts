import { describe, expect, it } from 'vitest'
import { judge } from './judge'
import { buildGrid } from './grid'
import { parseExercise } from './exercise'
import type { Slot } from './types'

const step = { hand: 'R' as const, accent: false }
const slotsAt = (times: number[], dur = 0.5): Slot[] =>
  times.map((t, index) => ({ index, t, dur, step, repeat: 0, bar: 0, beat: index, sub: 0 }))
const hit = (t: number, peakDb = -20) => ({ t, peakDb })

describe('judge', () => {
  const slots = slotsAt([1, 1.5, 2, 2.5])

  it('assegna ogni colpo allo slot più vicino e calcola offset in ms', () => {
    const r = judge(slots, [hit(1.01), hit(1.47), hit(2.0)])
    expect(r.judged[0].offsetMs).toBeCloseTo(10)
    expect(r.judged[1].offsetMs).toBeCloseTo(-30)
    expect(r.judged[2].offsetMs).toBeCloseTo(0)
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'good', 'miss'])
    expect(r.extras).toEqual([])
  })

  it('grade ai bordi: 20 ms è good, 20.5 è ok, 40 è ok, 41 è off', () => {
    const r = judge(slotsAt([1, 2, 3, 4], 1), [hit(1.02), hit(2.0205), hit(3.04), hit(4.041)])
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'ok', 'off'])
  })

  it('un colpo fuori da ogni finestra è extra e non tocca gli slot', () => {
    const r = judge(slots, [hit(3.0)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged.every((j) => j.grade === 'miss')).toBe(true)
  })

  it('due colpi sullo stesso slot: vince il più vicino, l altro è extra', () => {
    const r = judge(slots, [hit(1.1), hit(0.98)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('due colpi sullo stesso slot, il più vicino arriva prima: il secondo (più lontano) non lo sfratta', () => {
    const r = judge(slots, [hit(0.98), hit(1.1)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('con now, gli slot con finestra ancora aperta sono pending, non miss', () => {
    const r = judge(slots, [hit(1.0)], { now: 1.6 })
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'pending', 'pending', 'pending'])
  })

  it('offset positivo = in ritardo', () => {
    const r = judge(slotsAt([1], 1), [hit(1.03)])
    expect(r.judged[0].offsetMs).toBeGreaterThan(0)
  })

  it('finestre personalizzate', () => {
    const r = judge(slotsAt([1], 1), [hit(1.015)], { windows: { goodMs: 10, okMs: 30 } })
    expect(r.judged[0].grade).toBe('ok')
  })

  it('nessuno slot: tutto extra', () => {
    const r = judge([], [hit(1)])
    expect(r.extras).toHaveLength(1)
  })

  it('la finestra è per slot: uno slot corto non prende un colpo che uno lungo prenderebbe', () => {
    const slots: Slot[] = [
      { index: 0, t: 0, dur: 1, step, repeat: 0, bar: 0, beat: 0, sub: 0 },
      { index: 1, t: 1, dur: 0.25, step, repeat: 0, bar: 0, beat: 1, sub: 0 },
    ]
    expect(judge(slots, [hit(0.9)]).judged[1].offsetMs).toBeCloseTo(-100)
    expect(judge(slots, [hit(0.8)]).extras).toHaveLength(1)
  })
})

describe('la finestra è per slot: il buco reale fra terzina e sedicesimo', () => {
  // stesso esercizio del test "suddivisioni miste" di grid.test.ts: 'RLR LRLR' in 2/4 a 60 bpm.
  // slot[2]: t=2/3, dur=1/3 → finestra [1/2, 5/6≈0.8333]. slot[3]: t=1, dur=0.25 → finestra [0.875, 1.125].
  // fra le due finestre resta un buco (0.8333, 0.875) di ~42 ms: l'ordine di grandezza delle soglie good/ok,
  // proprio dove atterrano i colpi reali di un batterista.
  const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
  const grid = buildGrid(ex, 60, 0, { countInBars: 0 })

  it('un colpo nel buco non è preso da nessuno dei due slot vicini: extra', () => {
    const r = judge(grid.slots, [hit(0.85)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged[2].hit).toBeNull()
    expect(r.judged[3].hit).toBeNull()
  })

  it('colpi appena dentro ciascuna finestra vicina vengono presi, non extra', () => {
    const r = judge(grid.slots, [hit(0.82), hit(0.88)])
    expect(r.judged[2].hit?.t).toBe(0.82)
    expect(r.judged[3].hit?.t).toBe(0.88)
    expect(r.extras).toHaveLength(0)
  })
})
