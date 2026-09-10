import { describe, expect, it } from 'bun:test'
import { gaussian, hashPair, mulberry32, rngFor } from './rng'

describe('mulberry32', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const xs = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs)
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs)
  })

  it('stays in [0, 1)', () => {
    const r = mulberry32(7)
    let min = 1
    let max = 0
    for (let i = 0; i < 10000; i++) {
      const x = r()
      if (x < min) min = x
      if (x > max) max = x
    }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThan(1)
  })
})

describe('rngFor', () => {
  it('depends only on (seed, index), never on the order of the calls', () => {
    const first = rngFor(1, 5)()
    rngFor(1, 3)()
    expect(rngFor(1, 5)()).toBe(first)
    expect(rngFor(2, 5)()).not.toBe(first)
    expect(rngFor(1, 6)()).not.toBe(first)
  })

  it('hashPair separates neighbours and is not symmetric', () => {
    expect(hashPair(1, 2)).not.toBe(hashPair(2, 1))
    expect(hashPair(0, 0)).not.toBe(hashPair(0, 1))
  })
})

describe('gaussian', () => {
  it('has mean ≈ 0 and σ ≈ 1 over 20000 draws', () => {
    const r = mulberry32(99)
    const n = 20000
    let sum = 0
    let sq = 0
    for (let i = 0; i < n; i++) {
      const g = gaussian(r)
      sum += g
      sq += g * g
    }
    const mean = sum / n
    const sd = Math.sqrt(sq / n - mean * mean)
    // Standard error of the mean is 1/√20000 ≈ 0.007: 0.03 is four of them.
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
  })
})
