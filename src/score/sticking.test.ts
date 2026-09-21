import { describe, expect, it } from 'bun:test'
import { EXERCISES_JSON } from '../data/exercises'
import type { ExerciseJson } from '../engine/types'
import { flattenBar } from './events'
import { fromSticking } from './sticking'
import type { Event, Item } from './types'
import { validate } from './validate'

const ex = (steps: string, extra: Partial<ExerciseJson> = {}): ExerciseJson => ({
  id: 't',
  name: 'T',
  timeSignature: [4, 4],
  steps,
  repeats: 1,
  ...extra,
})
const items = (steps: string, extra?: Partial<ExerciseJson>): Item[] => fromSticking(ex(steps, extra)).bars[0].items
const snare = (base: 4 | 8 | 16 | 32, sticking: 'R' | 'L', extra: Partial<Event> = {}): Event => ({
  duration: { base },
  sticking,
  ...extra,
})

describe('fromSticking', () => {
  it('turns each beat into written values by its subdivision', () => {
    expect(items('R RL RLRL RLRLRLRL')).toEqual([
      snare(4, 'R'),
      snare(8, 'R'),
      snare(8, 'L'),
      snare(16, 'R'),
      snare(16, 'L'),
      snare(16, 'R'),
      snare(16, 'L'),
      ...['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L'].map((h) => snare(32, h as 'R' | 'L')),
    ])
  })
  it('wraps 3, 5, 6 and 7 in a tuplet', () => {
    expect(items('RLR RLRLR RLRLRL RLRLRLR')).toEqual([
      { tuplet: { actual: 3, normal: 2 }, items: [snare(8, 'R'), snare(8, 'L'), snare(8, 'R')] },
      { tuplet: { actual: 5, normal: 4 }, items: ['R', 'L', 'R', 'L', 'R'].map((h) => snare(16, h as 'R' | 'L')) },
      { tuplet: { actual: 6, normal: 4 }, items: ['R', 'L', 'R', 'L', 'R', 'L'].map((h) => snare(16, h as 'R' | 'L')) },
      {
        tuplet: { actual: 7, normal: 4 },
        items: ['R', 'L', 'R', 'L', 'R', 'L', 'R'].map((h) => snare(16, h as 'R' | 'L')),
      },
    ])
  })
  it('keeps accents, rests, grace notes and rolls', () => {
    // Seven beats, one per token group: a 7/4 bar keeps the fixture in one bar.
    expect(items('>R L- f(L)R dR zR tL RL-L', { timeSignature: [7, 4] })).toEqual([
      snare(4, 'R', { accent: true }),
      snare(8, 'L'),
      { duration: { base: 8 }, rest: true },
      snare(4, 'R', { grace: { kind: 'flam' } }),
      snare(4, 'R', { grace: { kind: 'drag' } }),
      snare(4, 'R', { roll: { kind: 'buzz' } }),
      snare(4, 'L', { roll: { kind: 'tremolo', slashes: 1 } }),
      snare(16, 'R'),
      snare(16, 'L'),
      { duration: { base: 16 }, rest: true },
      snare(16, 'L'),
    ])
  })
  it('parses the grace hand and leaves it out of the score', () => {
    expect(items('f(R)R L L L')[0]).toEqual(snare(4, 'R', { grace: { kind: 'flam' } }))
    expect(items('d(L)R L L L')[0]).toEqual(snare(4, 'R', { grace: { kind: 'drag' } }))
  })
  it('puts the meter on the first bar and the repeats on the piece, in the flat shape', () => {
    const s = fromSticking(ex('RL RL | RL RL', { timeSignature: [2, 4], repeats: 20, source: 'Stick Control, p. 5' }))
    expect(Object.keys(s)).toEqual(['id', 'title', 'source', 'bars'])
    expect(s).toMatchObject({ id: 't', title: 'T', source: 'Stick Control, p. 5' })
    expect(s.bars).toHaveLength(2)
    expect(s.bars[0].meter).toEqual([2, 4])
    expect(s.bars[1].meter).toBeUndefined()
    expect(s.bars[0].repeat).toEqual({ start: true })
    expect(s.bars[1].repeat).toEqual({ end: { times: 20 } })
    expect(Object.keys(s.bars[0])).toEqual(['meter', 'repeat', 'items'])
    expect(Object.keys(s.bars[1])).toEqual(['repeat', 'items'])
    const once = fromSticking(ex('R R R R'))
    expect(once.bars[0].repeat).toBeUndefined()
    expect(Object.keys(once)).toEqual(['id', 'title', 'bars'])
    const oneBar = fromSticking(ex('R R R R', { repeats: 4 }))
    expect(oneBar.bars[0].repeat).toEqual({ start: true, end: { times: 4 } })
  })
  it('defaults repeats to 20 like parseExercise, and refuses what parseExercise refuses', () => {
    expect(fromSticking(ex('R R R R', { repeats: undefined })).bars[0].repeat).toEqual({
      start: true,
      end: { times: 20 },
    })
    expect(() => fromSticking(ex('R R R R', { timeSignature: [4, 8] }))).toThrow('t: only x/4 time signatures')
    expect(() => fromSticking(ex('R R R R', { repeats: 0 }))).toThrow('t: invalid repeats')
    expect(() => fromSticking(ex('R R R'))).toThrow('bar 1: 3 beats, expected 4')
  })
  it('compiles the whole library into valid scores', () => {
    for (const json of EXERCISES_JSON) {
      const s = fromSticking(json)
      expect({ id: s.id, problems: validate(s) }).toEqual({ id: json.id, problems: [] })
      const sounding = s.bars.flatMap(flattenBar).filter((f) => !f.event.rest)
      expect(sounding.length).toBeGreaterThan(0)
    }
  })
})
