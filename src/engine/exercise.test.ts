import { describe, expect, it } from 'vitest'
import { parseExercise, parseSteps, stepsPerBar } from './exercise'
import { EXERCISES } from '../data/exercises'

describe('parseSteps', () => {
  it('legge R, L, pause e accenti, ignorando gli spazi', () => {
    expect(parseSteps('RL -  >R')).toEqual([
      { hand: 'R', accent: false },
      { hand: 'L', accent: false },
      { hand: null, accent: false },
      { hand: 'R', accent: true },
    ])
  })
  it('rifiuta caratteri sconosciuti', () => {
    expect(() => parseSteps('RLx')).toThrow(/carattere non valido/)
  })
  it('rifiuta un accento senza colpo', () => {
    expect(() => parseSteps('RL>')).toThrow(/accento/)
  })
  it('rifiuta un accento prima di una pausa', () => {
    expect(() => parseSteps('R>-L')).toThrow(/accento/)
  })
})

describe('stepsPerBar', () => {
  it('2/4 in ottavi = 4, 4/4 in sedicesimi = 16, 4/4 in terzine = 12', () => {
    expect(stepsPerBar([2, 4], 8)).toBe(4)
    expect(stepsPerBar([4, 4], 16)).toBe(16)
    expect(stepsPerBar([4, 4], '8t')).toBe(12)
  })
})

describe('parseExercise', () => {
  const base = { id: 'x', name: 'x', timeSignature: [2, 4] as [number, number], subdivision: 8 as const }
  it('accetta 8 ottavi in 2/4 = 2 battute, repeats default 20', () => {
    const ex = parseExercise({ ...base, steps: 'RLRL RLRL' })
    expect(ex.steps).toHaveLength(8)
    expect(ex.repeats).toBe(20)
  })
  it('rifiuta step che non riempiono battute intere', () => {
    expect(() => parseExercise({ ...base, steps: 'RLRL RL' })).toThrow(/battute intere/)
  })
  it('rifiuta esercizi di sole pause', () => {
    expect(() => parseExercise({ ...base, steps: '----' })).toThrow(/solo pause/)
  })
  it('rifiuta repeats non intero positivo', () => {
    expect(() => parseExercise({ ...base, steps: 'RLRL', repeats: 0 })).toThrow(/repeats/)
  })
})

describe('esercizi built-in', () => {
  it('sono i tre di Stick Control, validi', () => {
    expect(EXERCISES.map((e) => e.id)).toEqual(['stone-1', 'stone-3', 'stone-5'])
    expect(EXERCISES[2].steps.map((s) => s.hand).join('')).toBe('RLRRLRLL')
  })
})
