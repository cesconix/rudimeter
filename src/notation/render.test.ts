import { describe, expect, it } from 'bun:test'
import { MIN_NOTEHEAD_PX, NATURAL_NOTEHEAD_PX, fitLayout, notationFontsReady } from './render'

// `document.fonts` non esiste (`bun test` gira senza DOM, niente jsdom), quindi qui non si può
// verificare la vera race del font Bravura nel browser — quella resta un controllo manuale
// (vedi `dev/gallery.html`). Questo test copre solo l'idraulica della funzione con un
// `document.fonts.ready` finto: che deleghi a quella promise e che risolva a `undefined`
// invece di restituire il `FontFaceSet` (per non far trapelare il tipo, come richiesto dal contratto).
describe('notationFontsReady', () => {
  it('risolve a undefined, senza far trapelare il FontFaceSet di document.fonts.ready', async () => {
    const fakeFontFaceSet = { fake: true }
    const g = globalThis as { document?: unknown }
    const previous = g.document
    g.document = { fonts: { ready: Promise.resolve(fakeFontFaceSet) } }
    try {
      const result = await notationFontsReady()
      expect(result).toBeUndefined()
    } finally {
      if (previous === undefined) delete g.document
      else g.document = previous
    }
  })
})

// `fitLayout` è pura (nessun DOM, nessun VexFlow): è la sola parte del render verificabile qui.
// I test fissano le PROPRIETÀ del layout — aggancio musicale, tetto della scala, pavimento di
// leggibilità — più la tabella dei valori misurati a mano nel browser sull'esercizio reale, che è
// l'unica cosa che distingue una regola buona da una che riempie lo schermo di puntini.
describe('fitLayout', () => {
  /** Testa di nota che l'utente vede davvero, arrotondata al decimo come nelle misure a schermo. */
  const notehead = (scale: number) => Math.round(NATURAL_NOTEHEAD_PX * scale * 10) / 10

  // Stick Control: 2/4, 2 battute per ripetizione, 20 ripetizioni = 40 battute. Larghezze misurate
  // sui dispositivi veri (iPhone in verticale e in orizzontale, iPad, desktop).
  it.each([
    [375, 2, 9.6],
    [390, 2, 10.0],
    [834, 4, 11.6],
    [844, 4, 11.8],
    [847, 4, 11.8],
    [1194, 6, 11.5],
    [1600, 8, 11.7],
  ])('a %p px: %p battute per riga, testa %p px', (availW, barsPerRow, head) => {
    const fit = fitLayout(availW, 2, 2, 40)
    expect(fit.barsPerRow).toBe(barsPerRow)
    expect(notehead(fit.scale)).toBe(head)
  })

  it('riempire non vale il rimpicciolimento se una riga più corta riempie già', () => {
    // A 847px 4 battute occupano 846px: riempiono lo schermo al corpo pieno. Prendere il candidato
    // successivo (6 battute) coprirebbe la stessa larghezza con teste da 8.1px — il pavimento di
    // illeggibilità — per mostrare una ripetizione in più. Il margine del 10% è ciò che lo impedisce.
    const fit = fitLayout(847, 2, 2, 40)
    expect(fit.barsPerRow).toBe(4)
    expect(fit.scale).toBe(1)
    expect(fit.systemH).toBe(140)
  })

  it('schermo largo: la riga è un multiplo della ripetizione', () => {
    for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
      const fit = fitLayout(4000, barsPerRepeat, 4, 40)
      expect(fit.barsPerRow % barsPerRepeat).toBe(0)
    }
  })

  it('la scala non supera mai il naturale', () => {
    for (const availW of [847, 1200, 2000, 4000, 10000]) {
      expect(fitLayout(availW, 8, 4, 40).scale).toBeLessThanOrEqual(1)
    }
  })

  it('schermo stretto: si scende alla mezza ripetizione, non oltre e non a caso', () => {
    // 900px in 4/4: 2 battute occupano 846px (riempiono), 4 ne vorrebbero 1614. La risposta giusta
    // è una sola, 2 — un test che accettasse anche 1 non distinguerebbe una regola sbagliata.
    expect(fitLayout(900, 4, 4, 40).barsPerRow).toBe(2)
  })

  it('la riga non è mai più lunga del pezzo', () => {
    // Esercizio senza ripetizioni: 2 battute in tutto su 928px. Impaccare 6 battute per riga
    // disegnerebbe la musica al 75% con due terzi di rigo vuoto, avendo spazio per il naturale.
    const fit = fitLayout(928, 2, 2, 2)
    expect(fit.barsPerRow).toBe(2)
    expect(fit.scale).toBe(1)
  })

  it('battute per ripetizione o totali non valide: una riga sbagliata, mai NaN', () => {
    // NaN qui non si vede: arriva silenzioso fino a renderer.resize(NaN, NaN) e lascia un riquadro
    // bianco senza una riga in console.
    for (const [barsPerRepeat, totalBars] of [[0, 40], [2, 0], [-3, 40], [2.7, 40.9], [NaN, 40], [2, NaN]]) {
      const fit = fitLayout(800, barsPerRepeat, 2, totalBars)
      expect(fit.barsPerRow).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(fit.barsPerRow)).toBe(true)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.systemH)).toBe(true)
    }
  })

  it('larghezza disponibile non valida: stessa sorte, mai NaN', () => {
    // Dagli altri due parametri la guardia c'era già; questa chiude la stessa porta sul terzo.
    // Oggi `availW` viene da `clientWidth` e non può essere NaN, ma `fitLayout` è esportata.
    for (const availW of [NaN, Infinity, -Infinity, -100]) {
      const fit = fitLayout(availW, 2, 2, 40)
      expect(fit.barsPerRow).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.systemH)).toBe(true)
    }
  })

  it('la testa di nota non scende sotto il minimo leggibile', () => {
    for (let availW = 480; availW <= 2000; availW += 20) {
      for (const beatsPerBar of [2, 3, 4]) {
        for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
          const fit = fitLayout(availW, barsPerRepeat, beatsPerBar, 40)
          expect(NATURAL_NOTEHEAD_PX * fit.scale).toBeGreaterThanOrEqual(MIN_NOTEHEAD_PX)
        }
      }
    }
  })

  it('la gronda delle acciaccature toglie larghezza alla musica, non alla scala', () => {
    // 468px, 2/4, 2 battute per ripetizione. Senza gronda 2 battute occupano 462: ci stanno intere.
    // Con i 24px che servono al flam sul primo movimento diventano 486, e si rimpicciolisce per
    // tenerne comunque 2 — l'alternativa (scendere a 1) sprecherebbe mezza riga.
    expect(fitLayout(468, 2, 2, 40)).toMatchObject({ barsPerRow: 2, scale: 1 })
    const conGronda = fitLayout(468, 2, 2, 40, 24)
    expect(conGronda.barsPerRow).toBe(2)
    expect(conGronda.scale).toBeCloseTo(468 / 486, 3)
  })

  it('gronda negativa: trattata come assente, mai una riga più larga del vero', () => {
    expect(fitLayout(900, 2, 2, 40, -50)).toEqual(fitLayout(900, 2, 2, 40, 0))
  })

  it('almeno una battuta per riga anche su una larghezza assurda', () => {
    // Sotto la larghezza di una battuta il pavimento di leggibilità non è più tenibile: si sceglie
    // di mostrare una battuta illeggibile invece di zero battute.
    const fit = fitLayout(10, 4, 4, 40)
    expect(fit.barsPerRow).toBe(1)
    expect(fit.scale).toBeGreaterThan(0)
    expect(fit.scale).toBeLessThan(1)
  })
})
