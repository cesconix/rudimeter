import { describe, expect, it } from 'vitest'
import { barsOf, parseExercise, slotsPerRepeat, stepsFlat } from './exercise'
import { EXERCISES } from '../data/exercises'

const base = { id: 'x', name: 'x', timeSignature: [2, 4] as [number, number] }

describe('parseExercise', () => {
  it('legge la DSL v2, conserva la stringa, repeats default 20', () => {
    const ex = parseExercise({ ...base, steps: 'RL RL | RL RL' })
    expect(ex.bars).toHaveLength(2)
    expect(ex.sticking).toBe('RL RL | RL RL')
    expect(ex.repeats).toBe(20)
    expect(barsOf(ex)).toBe(2)
  })
  it('rifiuta tempi che non sono x/4', () => {
    expect(() => parseExercise({ ...base, timeSignature: [6, 8], steps: 'RLR LRL' })).toThrow(/x\/4/)
  })
  it('rifiuta esercizi di sole pause', () => {
    expect(() => parseExercise({ ...base, steps: '-- --' })).toThrow(/solo pause/)
  })
  it('rifiuta repeats non intero positivo', () => {
    expect(() => parseExercise({ ...base, steps: 'RL RL', repeats: 0 })).toThrow(/repeats/)
  })
  it('propaga gli errori del parser con il numero di battuta', () => {
    expect(() => parseExercise({ ...base, steps: 'RL RL | RL' })).toThrow(/battuta 2/)
  })
})

describe('stepsFlat / slotsPerRepeat', () => {
  const ex = parseExercise({ ...base, steps: 'R- LRL | RL RL' })
  it('elenca gli step in ordine battuta → movimento → figura, pause incluse, con ordinale', () => {
    const flat = stepsFlat(ex)
    expect(flat.map((f) => f.step.hand)).toEqual(['R', null, 'L', 'R', 'L', 'R', 'L', 'R', 'L'])
    expect(flat[2]).toMatchObject({ bar: 0, beat: 1, sub: 0, n: 3, ordinal: 2 })
    expect(flat[8]).toMatchObject({ bar: 1, beat: 1, sub: 1, n: 2, ordinal: 8 })
  })
  it('conta solo gli step con mano', () => {
    expect(slotsPerRepeat(ex)).toBe(8)
  })
})

describe('esercizi built-in', () => {
  it('sono i tre di Stick Control, validi', () => {
    expect(EXERCISES.map((e) => e.id)).toEqual(['stone-1', 'stone-3', 'stone-5'])
    expect(stepsFlat(EXERCISES[2]).map((f) => f.step.hand).join('')).toBe('RLRRLRLL')
  })
})
