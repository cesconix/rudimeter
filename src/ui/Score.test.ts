import { describe, expect, it } from 'bun:test'
import { EXERCISES } from '../data/exercises'
import { buildGrid } from '../engine/grid'
import { planExercise } from '../notation/plan'

// `Score` uses `Slot.index` (engine/grid) as the key into `RenderedScore.notes` (notation/render), whose
// keys are the `slotIndex` of notation/plan. The two indexes are born from the same exercise but cross
// different modules (engine/grid vs notation/plan) and no end-to-end test had ever checked, on the real
// data of the library, that they agree: a divergence would colour the wrong note (or none) without any
// error. Pure test, no DOM/React: only grid + plan.
describe('EXERCISES: the sounding slots of engine/grid and the slotIndex of notation/plan agree', () => {
  for (const ex of EXERCISES) {
    it(`${ex.id}: same set of indexes, in the same order, no duplicates (rests excluded from both)`, () => {
      const grid = buildGrid(ex, 120, 0)
      const plan = planExercise(ex)

      const gridIndexes = grid.slots.map((s) => s.index)
      const planIndexes = plan
        .flatMap((bar) => bar.beats.flatMap((beat) => beat.notes))
        .map((n) => n.slotIndex)
        .filter((i): i is number => i !== null)

      // Comparison on the sorted arrays (not on Sets): a duplicate that happened to coincide with an
      // index missing elsewhere would stay invisible to a comparison by sets.
      expect([...planIndexes].sort((a, b) => a - b)).toEqual([...gridIndexes].sort((a, b) => a - b))
      expect(new Set(gridIndexes).size).toBe(gridIndexes.length)
      expect(new Set(planIndexes).size).toBe(planIndexes.length)
    })
  }
})
