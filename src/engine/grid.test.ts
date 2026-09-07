import { describe, expect, it } from 'vitest'
import { buildGrid, gridPosition, stepDuration } from './grid'
import { parseExercise } from './exercise'

const stone1 = parseExercise({ id: 's1', name: 's1', timeSignature: [2, 4], subdivision: 8, steps: 'RLRL RLRL', repeats: 2 })

describe('stepDuration', () => {
  it('ottavi a 60 bpm in 2/4 durano 0.5 s, sedicesimi 0.25, terzine 1/3', () => {
    expect(stepDuration(stone1, 60)).toBeCloseTo(0.5)
    expect(stepDuration({ ...stone1, subdivision: 16 }, 60)).toBeCloseTo(0.25)
    expect(stepDuration({ ...stone1, subdivision: '8t' }, 60)).toBeCloseTo(1 / 3)
  })
})

describe('buildGrid', () => {
  it('count-in di 1 battuta, poi 8 step × 2 ripetizioni ogni 0.5 s', () => {
    const g = buildGrid(stone1, 60, 10)
    expect(g.countInEnd).toBeCloseTo(12)
    expect(g.slots).toHaveLength(16)
    expect(g.slots[0].t).toBeCloseTo(12)
    expect(g.slots[15].t).toBeCloseTo(12 + 15 * 0.5)
    expect(g.slots[9].repeat).toBe(1)
    expect(g.slots[9].stepIndex).toBe(1)
    expect(g.slots[5].bar).toBe(1)
    expect(g.stepDur).toBeCloseTo(0.5)
    expect(g.end).toBeCloseTo(20)
  })
  it('un click per beat, count-in incluso', () => {
    const g = buildGrid(stone1, 120, 0)
    expect(g.countInClicks).toBe(2)
    expect(g.clickTimes).toHaveLength(2 + 2 * 2 * 2)
    expect(g.clickTimes[1]).toBeCloseTo(0.5)
  })
  it('le pause non generano slot ma occupano tempo', () => {
    const ex = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], subdivision: 8, steps: 'R-L-', repeats: 1 })
    const g = buildGrid(ex, 60, 0)
    expect(g.slots.map((s) => s.t)).toEqual([2, 3])
    expect(g.slots.map((s) => s.step.hand)).toEqual(['R', 'L'])
    expect(g.slots.map((s) => s.index)).toEqual([0, 1])
  })
  it('count-in di 0 battute parte subito', () => {
    const g = buildGrid(stone1, 60, 5, { countInBars: 0 })
    expect(g.countInEnd).toBeCloseTo(5)
    expect(g.countInClicks).toBe(0)
  })
})

describe('gridPosition', () => {
  // countInEnd 2, stepDur 0.5, 8 step × 2 ripetizioni (16 step totali)
  const g = buildGrid(stone1, 60, 0)

  it('prima del count-in: nulla evidenziato', () => {
    expect(gridPosition(g, 0, 8, 2, false)).toEqual({ repeat: 0, currentStep: -1 })
  })

  it('primo step della prima ripetizione', () => {
    expect(gridPosition(g, 2, 8, 2, false)).toEqual({ repeat: 0, currentStep: 0 })
  })

  it('step a metà esercizio, seconda ripetizione', () => {
    expect(gridPosition(g, 7, 8, 2, false)).toEqual({ repeat: 1, currentStep: 2 })
  })

  it("ultimo step dell'ultima ripetizione resta evidenziato", () => {
    expect(gridPosition(g, 9.5, 8, 2, false)).toEqual({ repeat: 1, currentStep: 7 })
  })

  it('regressione: a k === stepsTotal * repeats nulla resta evidenziato', () => {
    expect(gridPosition(g, 10, 8, 2, false)).toEqual({ repeat: 1, currentStep: -1 })
  })

  it('oltre la fine con sessione done: nulla evidenziato', () => {
    expect(gridPosition(g, 100, 8, 2, true)).toEqual({ repeat: 1, currentStep: -1 })
  })
})
