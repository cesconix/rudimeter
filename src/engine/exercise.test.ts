import { describe, expect, it } from 'bun:test'
import { EXERCISES } from '../data/exercises'
import { barsOf, parseExercise, slotsPerRepeat, stepsFlat } from './exercise'

const base = { id: 'x', name: 'x', timeSignature: [2, 4] as [number, number] }

describe('parseExercise', () => {
  it('reads DSL v2, keeps the string, repeats defaults to 20', () => {
    const ex = parseExercise({ ...base, steps: 'RL RL | RL RL' })
    expect(ex.bars).toHaveLength(2)
    expect(ex.sticking).toBe('RL RL | RL RL')
    expect(ex.repeats).toBe(20)
    expect(barsOf(ex)).toBe(2)
  })
  it('rejects time signatures that are not x/4', () => {
    expect(() => parseExercise({ ...base, timeSignature: [6, 8], steps: 'RLR LRL' })).toThrow(/x\/4/)
  })
  it('rejects exercises made of rests only', () => {
    expect(() => parseExercise({ ...base, steps: '-- --' })).toThrow(/rests only/)
  })
  it('rejects a repeats that is not a positive integer', () => {
    expect(() => parseExercise({ ...base, steps: 'RL RL', repeats: 0 })).toThrow(/repeats/)
  })
  it('propagates the parser errors with the bar number', () => {
    expect(() => parseExercise({ ...base, steps: 'RL RL | RL' })).toThrow(/bar 2/)
  })
})

describe('stepsFlat / slotsPerRepeat', () => {
  const ex = parseExercise({ ...base, steps: 'R- LRL | RL RL' })
  it('lists the steps in bar → beat → note order, rests included, with an ordinal', () => {
    const flat = stepsFlat(ex)
    expect(flat.map((f) => f.step.hand)).toEqual(['R', null, 'L', 'R', 'L', 'R', 'L', 'R', 'L'])
    expect(flat[2]).toMatchObject({ bar: 0, beat: 1, sub: 0, n: 3, ordinal: 2 })
    expect(flat[8]).toMatchObject({ bar: 1, beat: 1, sub: 1, n: 2, ordinal: 8 })
  })
  it('counts only the steps with a hand', () => {
    expect(slotsPerRepeat(ex)).toBe(8)
  })
})

describe('built-in exercises', () => {
  it('the three from Stick Control, the reading study and the two pyramids, all valid', () => {
    expect(EXERCISES.map((e) => e.id)).toEqual([
      'stone-1',
      'stone-3',
      'stone-5',
      'reading-4-4',
      'pyramid-singles',
      'pyramid-doubles',
    ])
    expect(
      stepsFlat(EXERCISES[2])
        .map((f) => f.step.hand)
        .join(''),
    ).toBe('RLRRLRLL')
  })
  it('the reading study brings the note values Stone does not have', () => {
    // The point of the exercise is VARIETY: if one day someone "simplifies" it to a constant
    // subdivision it is good for nothing any more, and this test says so instead of letting it pass.
    // biome-ignore lint/style/noNonNullAssertion: the exercise ships in EXERCISES, and if it is ever removed this test must fail here.
    const l = EXERCISES.find((e) => e.id === 'reading-4-4')!
    expect(l.timeSignature).toEqual([4, 4])
    // Notes per beat: quarter, eighths, sixteenths, eighths | triplet, eighths, sixteenths, quarter.
    expect(l.bars.map((b) => b.beats.map((bt) => bt.steps.length))).toEqual([
      [1, 2, 4, 2],
      [3, 2, 4, 1],
    ])
    // Rests of three different values: eighth, eighth, sixteenth, beat.
    expect(
      stepsFlat(l)
        .filter((f) => f.step.hand === null)
        .map((f) => f.n),
    ).toEqual([2, 2, 4, 1])
  })
})
