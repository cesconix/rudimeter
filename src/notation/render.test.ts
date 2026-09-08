import { describe, expect, it, vi } from 'vitest'
import { MIN_NOTEHEAD_PX, NATURAL_NOTEHEAD_PX, fitLayout, notationFontsReady } from './render'

// `document.fonts` non esiste nell'ambiente vitest `node` (vitest.config.ts usa `environment: 'node'`,
// niente jsdom), quindi qui non si può verificare la vera race del font Bravura nel browser — quella
// resta un controllo manuale (vedi docs/spike-notation.md). Questo test copre solo l'idraulica della
// funzione con un `document.fonts.ready` finto: che deleghi a quella promise e che risolva a `undefined`
// invece di restituire il `FontFaceSet` (per non far trapelare il tipo, come richiesto dal contratto).
describe('notationFontsReady', () => {
  it('risolve a undefined, senza far trapelare il FontFaceSet di document.fonts.ready', async () => {
    const fakeFontFaceSet = { fake: true }
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve(fakeFontFaceSet) } })
    try {
      const result = await notationFontsReady()
      expect(result).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

// `fitLayout` è pura (nessun DOM, nessun VexFlow): è la sola parte del render verificabile qui.
// I test fissano le PROPRIETÀ del layout — aggancio musicale, tetto della scala, pavimento di
// leggibilità — non i numeri: i numeri cambiano al primo ritocco della geometria naturale, le
// proprietà no, e sono loro il contratto.
describe('fitLayout', () => {
  const noteheadOf = (scale: number) => NATURAL_NOTEHEAD_PX * scale

  it('schermo largo: la riga è un multiplo della ripetizione', () => {
    for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
      const fit = fitLayout(4000, barsPerRepeat, 4)
      expect(fit.barsPerRow % barsPerRepeat).toBe(0)
    }
  })

  it('la scala non supera mai il naturale: su schermo largo si ferma a 1, non va oltre', () => {
    // Ripetizione da 8 battute a 4000px: ce ne starebbero 15 al limite di leggibilità, ma mezza
    // ripetizione non si prende — la riga si ferma a 8 e lo spazio che avanza NON diventa zoom.
    const fit = fitLayout(4000, 8, 4)
    expect(fit.barsPerRow).toBe(8)
    expect(fit.scale).toBe(1)
    expect(fit.systemH).toBe(110)
    for (const availW of [1200, 2000, 4000, 10000]) {
      expect(fitLayout(availW, 8, 4).scale).toBeLessThanOrEqual(1)
    }
  })

  it('schermo stretto: la riga è un divisore della ripetizione, mai un numero che la spezza', () => {
    // Un pattern di 4 battute su righe da 3 cadrebbe a cavallo a ogni giro: meglio 1 o 2.
    expect(4 % fitLayout(360, 4, 4).barsPerRow).toBe(0)
    expect(6 % fitLayout(640, 6, 2).barsPerRow).toBe(0)
    expect(8 % fitLayout(500, 8, 4).barsPerRow).toBe(0)
  })

  it('la testa di nota non scende sotto il minimo leggibile', () => {
    for (let availW = 320; availW <= 2000; availW += 20) {
      for (const beatsPerBar of [2, 3, 4]) {
        for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
          const fit = fitLayout(availW, barsPerRepeat, beatsPerBar)
          expect(noteheadOf(fit.scale)).toBeGreaterThanOrEqual(MIN_NOTEHEAD_PX)
        }
      }
    }
  })

  it('almeno una battuta per riga anche su una larghezza assurda', () => {
    // Sotto la larghezza di una battuta il pavimento di leggibilità non è più tenibile: si sceglie
    // di mostrare una battuta illeggibile invece di zero battute.
    const fit = fitLayout(10, 4, 4)
    expect(fit.barsPerRow).toBe(1)
    expect(fit.scale).toBeGreaterThan(0)
    expect(fit.scale).toBeLessThan(1)
  })
})
