import { describe, expect, it } from 'bun:test'
import { cursorAt } from './cursor'

describe('cursorAt', () => {
  const pts = [
    { t: 0, x: 10, row: 0 },
    { t: 1, x: 50, row: 0 },
    { t: 2, x: 90, row: 0 },
  ]
  /** Inside the row the right edge does not enter the count: any value at all changes nothing. */
  const END = 400
  it('interpolates between adjacent points', () => {
    expect(cursorAt(pts, 0.5, END)).toEqual({ x: 30, row: 0 })
    expect(cursorAt(pts, 1.25, END)).toEqual({ x: 60, row: 0 })
    expect(cursorAt(pts, 1, END)).toEqual({ x: 50, row: 0 })
  })
  it('before the first point it sits on the first, after the last on the last', () => {
    expect(cursorAt(pts, -3, END)).toEqual({ x: 10, row: 0 })
    expect(cursorAt(pts, 7, END)).toEqual({ x: 90, row: 0 })
  })
  it('with no points: 0', () => {
    expect(cursorAt([], 1, END)).toEqual({ x: 0, row: 0 })
  })
  // At the row wrap the next point's x is further to the LEFT (new row, starts again from the
  // start): interpolating towards it would move the cursor backwards on screen. Stopping it on the
  // last note instead would leave it motionless while the music keeps going — and it shows.
  const wrapped = [
    { t: 0, x: 300, row: 0 },
    { t: 1, x: 20, row: 1 },
  ]
  it('at the row wrap it keeps going towards the right edge: it does not stop and does not go back', () => {
    expect(cursorAt(wrapped, 0.5, 380)).toEqual({ x: 340, row: 0 })
    expect(cursorAt(wrapped, 0.75, 380)).toEqual({ x: 360, row: 0 })
    // At the end of the interval it is practically at the edge; at the point after it is already on the row below.
    expect(cursorAt(wrapped, 0.999, 380).x).toBeCloseTo(379.92, 2)
    expect(cursorAt(wrapped, 1, 380)).toEqual({ x: 20, row: 1 })
  })
  it('at the row wrap it never moves back, not even with an absurd right edge', () => {
    // Edge to the left of the last note: should not happen (the score is at least as wide as its
    // notes), and if it does the cursor stays still instead of scrolling backwards.
    expect(cursorAt(wrapped, 0.5, 100)).toEqual({ x: 300, row: 0 })
    expect(cursorAt(wrapped, 0.5, 0)).toEqual({ x: 300, row: 0 })
  })
})
