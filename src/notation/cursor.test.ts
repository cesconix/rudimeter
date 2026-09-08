import { describe, expect, it } from 'vitest'
import { cursorAt } from './cursor'

describe('cursorAt', () => {
  const pts = [{ t: 0, x: 10, row: 0 }, { t: 1, x: 50, row: 0 }, { t: 2, x: 90, row: 0 }]
  it('interpola fra i punti adiacenti', () => {
    expect(cursorAt(pts, 0.5)).toEqual({ x: 30, row: 0 })
    expect(cursorAt(pts, 1.25)).toEqual({ x: 60, row: 0 })
    expect(cursorAt(pts, 1)).toEqual({ x: 50, row: 0 })
  })
  it('prima del primo punto sta sul primo, dopo l ultimo sull ultimo', () => {
    expect(cursorAt(pts, -3)).toEqual({ x: 10, row: 0 })
    expect(cursorAt(pts, 7)).toEqual({ x: 90, row: 0 })
  })
  it('senza punti: 0', () => {
    expect(cursorAt([], 1)).toEqual({ x: 0, row: 0 })
  })
  // Al capo riga la x del punto successivo è più a SINISTRA (nuova riga, si riparte da capo):
  // interpolare farebbe tornare indietro il cursore sullo schermo.
  it('al capo riga resta sull ultima nota della riga, non interpola verso la successiva', () => {
    const wrapped = [{ t: 0, x: 300, row: 0 }, { t: 1, x: 20, row: 1 }]
    expect(cursorAt(wrapped, 0.5)).toEqual({ x: 300, row: 0 })
    expect(cursorAt(wrapped, 0.99)).toEqual({ x: 300, row: 0 })
    expect(cursorAt(wrapped, 1)).toEqual({ x: 20, row: 1 })
  })
})
