import { describe, expect, it, vi } from 'vitest'
import { notationFontsReady } from './render'

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
