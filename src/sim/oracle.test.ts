import { describe, expect, it } from 'bun:test'
import { EXERCISES } from '../data/exercises'
import { toMarkdown } from '../engine/report'
import { runOracle } from './oracle'

const stone1 = EXERCISES.find((e) => e.id === 'stone-1')
if (!stone1) throw new Error('stone-1 is missing from the built-in exercises')

describe('runOracle', () => {
  it('steady drummer: every slot answered, nothing extra, offsets around zero', () => {
    const s = runOracle({ exercise: stone1, bpm: 120, preset: 'steady', seed: 42 })
    // 2 bars of 4 eighths, 20 repeats.
    expect(s.slots).toBe(160)
    expect(s.miss).toBe(0)
    expect(s.extras).toBe(0)
    expect(s.pending).toBe(0)
    expect(s.good + s.ok).toBe(160)
    // bias 0, σ 6 ms over 160 strokes: the mean sits within 3 ms, the σ between 4 and 8.
    expect(Math.abs(s.meanOffsetMs ?? 99)).toBeLessThan(3)
    expect(s.sdOffsetMs ?? 0).toBeGreaterThan(4)
    expect(s.sdOffsetMs ?? 99).toBeLessThan(8)
  })

  it('is deterministic for a seed and changes with it', () => {
    const cfg = { exercise: stone1, bpm: 120, preset: 'human' as const, seed: 42 }
    expect(runOracle(cfg)).toEqual(runOracle(cfg))
    expect(runOracle({ ...cfg, seed: 43 }).meanOffsetMs).not.toBe(runOracle(cfg).meanOffsetMs)
  })

  it('steady drummer earns the auto-increment', () => {
    const s = runOracle({
      exercise: stone1,
      bpm: 120,
      preset: 'steady',
      seed: 1,
      autoIncrement: { step: 4, after: 2, minAccuracy: 0.9, maxBpm: 240 },
    })
    expect(s.bpmByRepeat[0]).toBe(120)
    expect(s.bpmByRepeat[s.bpmByRepeat.length - 1]).toBeGreaterThan(120)
  })

  it('report for seed 42 (regression: Task 7 compares the browser against this)', () => {
    const s = runOracle({ exercise: stone1, bpm: 120, preset: 'human', seed: 42 })
    expect(toMarkdown(s, stone1, 120, new Date(2026, 0, 1), null)).toMatchSnapshot()
  })
})
