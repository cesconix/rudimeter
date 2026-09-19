import { describe, expect, it } from 'bun:test'
import { add, cmp, eq, frac, lengthOf, mul, sub, sum, toNumber, ZERO } from './fraction'
import type { Dots, NoteBase } from './types'

describe('frac', () => {
  it('reduces and keeps the sign on the numerator', () => {
    expect(frac(2, 4)).toEqual({ num: 1, den: 2 })
    expect(frac(3, -6)).toEqual({ num: -1, den: 2 })
    expect(frac(0, 7)).toEqual({ num: 0, den: 1 })
    expect(frac(5)).toEqual({ num: 5, den: 1 })
  })
  it('rejects a zero denominator and non-integers', () => {
    expect(() => frac(1, 0)).toThrow('invalid fraction 1/0')
    expect(() => frac(1.5, 2)).toThrow('invalid fraction 1.5/2')
  })
})

describe('arithmetic', () => {
  it('adds, subtracts, multiplies exactly', () => {
    expect(add(frac(1, 8), frac(1, 8))).toEqual(frac(1, 4))
    expect(sub(frac(1, 4), frac(1, 8))).toEqual(frac(1, 8))
    expect(mul(frac(1, 8), frac(2, 3))).toEqual(frac(1, 12))
    expect(sum([frac(1, 3), frac(1, 3), frac(1, 3)])).toEqual(frac(1))
    expect(sum([])).toEqual(ZERO)
  })
  it('compares', () => {
    expect(cmp(frac(1, 3), frac(1, 2))).toBe(-1)
    expect(cmp(frac(2, 4), frac(1, 2))).toBe(0)
    expect(cmp(frac(3, 4), frac(1, 2))).toBe(1)
    expect(eq(frac(2, 6), frac(1, 3))).toBe(true)
    expect(toNumber(frac(3, 4))).toBe(0.75)
  })
})

describe('lengthOf', () => {
  // Every base × every dot count: the whole table, because a wrong entry here is a wrong bar sum everywhere.
  it.each<[NoteBase, Dots, number, number]>([
    [1, 0, 1, 1],
    [2, 0, 1, 2],
    [4, 0, 1, 4],
    [8, 0, 1, 8],
    [16, 0, 1, 16],
    [32, 0, 1, 32],
    [4, 1, 3, 8],
    [8, 1, 3, 16],
    [2, 1, 3, 4],
    [4, 2, 7, 16],
    [8, 2, 7, 32],
  ])('base %i dots %i → %i/%i', (base, dots, num, den) => {
    expect(lengthOf({ base, dots })).toEqual(frac(num, den))
  })
  it('treats a missing dots as 0', () => {
    expect(lengthOf({ base: 8 })).toEqual(frac(1, 8))
  })
})
