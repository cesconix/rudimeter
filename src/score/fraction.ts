import type { Duration } from './types'

/** An exact length or position in whole-note units: always reduced, `den` always positive. */
export interface Fraction {
  num: number
  den: number
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b))

export function frac(num: number, den = 1): Fraction {
  if (den === 0 || !Number.isInteger(num) || !Number.isInteger(den)) throw new Error(`invalid fraction ${num}/${den}`)
  const sign = den < 0 ? -1 : 1
  // `|| 1`: gcd(0, n) is n, which would leave 0/1 as 0/n; and gcd(0, 0) cannot happen (den ≠ 0).
  const g = gcd(num, den) || 1
  return { num: (sign * num) / g, den: (sign * den) / g }
}

export const ZERO: Fraction = frac(0)

export const add = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.den + b.num * a.den, a.den * b.den)
export const sub = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.den - b.num * a.den, a.den * b.den)
export const mul = (a: Fraction, b: Fraction): Fraction => frac(a.num * b.num, a.den * b.den)
export const sum = (xs: Fraction[]): Fraction => xs.reduce(add, ZERO)

export function cmp(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const d = a.num * b.den - b.num * a.den
  return d < 0 ? -1 : d > 0 ? 1 : 0
}
export const eq = (a: Fraction, b: Fraction): boolean => cmp(a, b) === 0
export const toNumber = (a: Fraction): number => a.num / a.den

/** Written length of a note value: each dot adds half of what came before, so 1 + 1/2 + 1/4 = (2^(dots+1) − 1) / 2^dots of the base. */
export function lengthOf(d: Duration): Fraction {
  const dots = d.dots ?? 0
  return frac(2 ** (dots + 1) - 1, d.base * 2 ** dots)
}
