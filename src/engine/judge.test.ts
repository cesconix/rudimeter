import { describe, expect, it } from 'vitest'
import { judge } from './judge'
import type { Slot } from './types'

const step = { hand: 'R' as const, accent: false }
const slotsAt = (times: number[]): Slot[] =>
  times.map((t, index) => ({ index, t, step, repeat: 0, bar: 0, stepIndex: index }))
const hit = (t: number, peakDb = -20) => ({ t, peakDb })

describe('judge', () => {
  const slots = slotsAt([1, 1.5, 2, 2.5])
  const half = 0.25

  it('assegna ogni colpo allo slot più vicino e calcola offset in ms', () => {
    const r = judge(slots, [hit(1.01), hit(1.47), hit(2.0)], { halfWindow: half })
    expect(r.judged[0].offsetMs).toBeCloseTo(10)
    expect(r.judged[1].offsetMs).toBeCloseTo(-30)
    expect(r.judged[2].offsetMs).toBeCloseTo(0)
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'good', 'miss'])
    expect(r.extras).toEqual([])
  })

  it('grade ai bordi: 20 ms è good, 20.5 è ok, 40 è ok, 41 è off', () => {
    const r = judge(slotsAt([1, 2, 3, 4]), [hit(1.02), hit(2.0205), hit(3.04), hit(4.041)], { halfWindow: 0.5 })
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'ok', 'off'])
  })

  it('un colpo fuori da ogni finestra è extra e non tocca gli slot', () => {
    const r = judge(slots, [hit(3.0)], { halfWindow: half })
    expect(r.extras).toHaveLength(1)
    expect(r.judged.every((j) => j.grade === 'miss')).toBe(true)
  })

  it('due colpi sullo stesso slot: vince il più vicino, l altro è extra', () => {
    const r = judge(slots, [hit(1.1), hit(0.98)], { halfWindow: half })
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('con now, gli slot con finestra ancora aperta sono pending, non miss', () => {
    const r = judge(slots, [hit(1.0)], { halfWindow: half, now: 1.6 })
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'pending', 'pending', 'pending'])
  })

  it('offset positivo = in ritardo', () => {
    const r = judge(slotsAt([1]), [hit(1.03)], { halfWindow: 0.5 })
    expect(r.judged[0].offsetMs).toBeGreaterThan(0)
  })

  it('finestre personalizzate', () => {
    const r = judge(slotsAt([1]), [hit(1.015)], { halfWindow: 0.5, windows: { goodMs: 10, okMs: 30 } })
    expect(r.judged[0].grade).toBe('ok')
  })

  it('nessuno slot: tutto extra', () => {
    const r = judge([], [hit(1)], { halfWindow: 0.5 })
    expect(r.extras).toHaveLength(1)
  })
})
