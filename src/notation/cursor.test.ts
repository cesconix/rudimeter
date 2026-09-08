import { describe, expect, it } from 'vitest'
import { cursorX } from './cursor'

describe('cursorX', () => {
  const pts = [{ t: 0, x: 10 }, { t: 1, x: 50 }, { t: 2, x: 90 }]
  it('interpola fra i punti adiacenti', () => {
    expect(cursorX(pts, 0.5)).toBeCloseTo(30)
    expect(cursorX(pts, 1.25)).toBeCloseTo(60)
    expect(cursorX(pts, 1)).toBeCloseTo(50)
  })
  it('prima del primo punto sta sul primo, dopo l ultimo sull ultimo', () => {
    expect(cursorX(pts, -3)).toBe(10)
    expect(cursorX(pts, 7)).toBe(90)
  })
  it('senza punti: 0', () => {
    expect(cursorX([], 1)).toBe(0)
  })
})
