import { describe, expect, it } from 'vitest'
import { cursorAt } from './cursor'

describe('cursorAt', () => {
  const pts = [{ t: 0, x: 10, row: 0 }, { t: 1, x: 50, row: 0 }, { t: 2, x: 90, row: 0 }]
  /** Dentro la riga il bordo destro non entra nel conto: un valore qualsiasi non cambia nulla. */
  const END = 400
  it('interpola fra i punti adiacenti', () => {
    expect(cursorAt(pts, 0.5, END)).toEqual({ x: 30, row: 0 })
    expect(cursorAt(pts, 1.25, END)).toEqual({ x: 60, row: 0 })
    expect(cursorAt(pts, 1, END)).toEqual({ x: 50, row: 0 })
  })
  it('prima del primo punto sta sul primo, dopo l ultimo sull ultimo', () => {
    expect(cursorAt(pts, -3, END)).toEqual({ x: 10, row: 0 })
    expect(cursorAt(pts, 7, END)).toEqual({ x: 90, row: 0 })
  })
  it('senza punti: 0', () => {
    expect(cursorAt([], 1, END)).toEqual({ x: 0, row: 0 })
  })
  // Al capo riga la x del punto successivo è più a SINISTRA (nuova riga, si riparte da capo):
  // interpolare verso di essa farebbe tornare indietro il cursore sullo schermo. Fermarlo
  // sull'ultima nota invece lo lascerebbe immobile mentre la musica va avanti — e si vede.
  const wrapped = [{ t: 0, x: 300, row: 0 }, { t: 1, x: 20, row: 1 }]
  it('al capo riga continua verso il bordo destro: non si ferma e non torna indietro', () => {
    expect(cursorAt(wrapped, 0.5, 380)).toEqual({ x: 340, row: 0 })
    expect(cursorAt(wrapped, 0.75, 380)).toEqual({ x: 360, row: 0 })
    // A fine intervallo è praticamente al bordo; al punto dopo è già sulla riga sotto.
    expect(cursorAt(wrapped, 0.999, 380).x).toBeCloseTo(379.92, 2)
    expect(cursorAt(wrapped, 1, 380)).toEqual({ x: 20, row: 1 })
  })
  it('al capo riga non arretra mai, nemmeno con un bordo destro assurdo', () => {
    // Bordo a sinistra dell'ultima nota: non dovrebbe capitare (la partitura è larga almeno quanto
    // le sue note), e se capita il cursore sta fermo invece di scorrere all'indietro.
    expect(cursorAt(wrapped, 0.5, 100)).toEqual({ x: 300, row: 0 })
    expect(cursorAt(wrapped, 0.5, 0)).toEqual({ x: 300, row: 0 })
  })
})
