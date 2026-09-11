import { describe, expect, it } from 'bun:test'
import { matrixCell, parseFilter, softBeepCurve } from './lab-sounds'

describe('parseFilter', () => {
  it('off, lp:<hz>, hp:<hz>', () => {
    expect(parseFilter('off')).toEqual({ kind: 'off' })
    expect(parseFilter('lp:2500')).toEqual({ kind: 'lp', f: 2500 })
    expect(parseFilter('hp:3500')).toEqual({ kind: 'hp', f: 3500 })
    expect(() => parseFilter('bp:1000')).toThrow()
  })
})

describe('softBeepCurve', () => {
  it('starts and ends at zero, holds the gain in the middle', () => {
    const c = softBeepCurve(0.5, 128)
    expect(c[0]).toBe(0)
    expect(c[127]).toBeCloseTo(0, 5)
    expect(c[64]).toBeCloseTo(0.5, 5)
  })
})

describe('matrixCell', () => {
  it('heard, median echo latency, mean peak and strays', () => {
    const clicks = [1, 1.4, 1.8]
    const onsets = [
      { t: 1.068, peak: 0.1 },
      { t: 1.47, peak: 0.1 },
      { t: 2.3, peak: 0.1 }, // 500 ms after the last click: beyond the spacing, a stray
    ]
    expect(matrixCell(clicks, onsets, 0.4)).toEqual({ heard: 2, medianMs: 70, meanDb: -20, stray: 1 })
  })
  it('nothing heard', () => {
    expect(matrixCell([1, 1.4], [], 0.4)).toEqual({ heard: 0, medianMs: null, meanDb: null, stray: 0 })
  })
})
