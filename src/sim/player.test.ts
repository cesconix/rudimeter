import { describe, expect, it } from 'bun:test'
import { parseExercise } from '../engine/exercise'
import { buildGrid } from '../engine/grid'
import { PLAYER_PRESETS, planStrokes, type Stroke } from './player'

const answered = (s: Stroke): s is Stroke & { slot: number } => s.slot !== null

/** 8 slots per repeat, the first one accented; t0 = 10 s so nothing is confused with zero. */
const short = buildGrid(
  parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: '>RL RL | RL RL', repeats: 5 }),
  120,
  10,
).slots
const long = buildGrid(
  parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: '>RL RL | RL RL', repeats: 25 }),
  120,
  10,
).slots

describe('planStrokes', () => {
  it('steady: one stroke per slot, no extras, errors within 4σ, accents louder', () => {
    const model = PLAYER_PRESETS.steady
    const s = planStrokes(short, model, 1)
    expect(s).toHaveLength(short.length)
    expect(s.every(answered)).toBe(true)
    for (const st of s.filter(answered)) {
      expect(Math.abs(st.t - short[st.slot].t) * 1000).toBeLessThan(4 * model.sigmaMs)
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const acc = s.filter(answered).filter((st) => short[st.slot].step.accent)
    const plain = s.filter(answered).filter((st) => !short[st.slot].step.accent)
    expect(mean(acc.map((a) => a.peakDb)) - mean(plain.map((p) => p.peakDb))).toBeGreaterThan(5)
  })

  it('is sorted by time and deterministic for a seed', () => {
    const a = planStrokes(short, PLAYER_PRESETS.human, 42)
    expect(a).toEqual(planStrokes(short, PLAYER_PRESETS.human, 42))
    expect(a).not.toEqual(planStrokes(short, PLAYER_PRESETS.human, 43))
    for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t)
  })

  it('gives a slot the same stroke whatever the other slots are', () => {
    const all = planStrokes(short, PLAYER_PRESETS.sloppy, 7)
    const tail = planStrokes(short.slice(20), PLAYER_PRESETS.sloppy, 7)
    // Answered strokes belong to a slot; an extra of slot 19 sits before slot 20, one of slot ≥ 20 after it.
    expect(tail).toEqual(all.filter((st) => (st.slot !== null ? st.slot >= 20 : st.t >= short[20].t)))
  })

  it('sloppy: misses and extras happen; an extra never answers a slot and sits between two of them', () => {
    const s = planStrokes(long, PLAYER_PRESETS.sloppy, 3)
    const hit = new Set(s.filter(answered).map((st) => st.slot))
    expect(hit.size).toBeLessThan(long.length)
    const extras = s.filter((st) => st.slot === null)
    expect(extras.length).toBeGreaterThan(0)
    for (const e of extras) {
      const before = long.filter((sl) => sl.t < e.t).pop()
      if (!before) throw new Error('an extra before the first slot')
      // 0.44 and 0.56, not 0.45 and 0.55: floating-point slack on the exact boundaries.
      expect(e.t - before.t).toBeGreaterThan(before.dur * 0.44)
      expect(e.t - before.t).toBeLessThan(before.dur * 0.56)
    }
  })
})
