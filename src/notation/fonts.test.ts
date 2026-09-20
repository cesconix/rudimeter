import { describe, expect, it } from 'bun:test'
import { notationFontsReady } from './fonts'

// `document.fonts` does not exist (`bun test` runs without a DOM, no jsdom), so the real race with
// the Bravura font in the browser cannot be verified here — that stays a manual check (see
// `dev/gallery.html`). This test covers only the function's plumbing with a fake
// `document.fonts.ready`: that it delegates to that promise and resolves to `undefined` instead of
// returning the `FontFaceSet` (so as not to leak the type, as the contract requires).
describe('notationFontsReady', () => {
  it("resolves to undefined, without leaking document.fonts.ready's FontFaceSet", async () => {
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
