/**
 * Resolves when the fonts are ready in the document, VexFlow's Bravura music font included. It
 * does not keep a reference to `document.fonts`' `FontFaceSet`: the promise resolved to `void` is
 * enough for the caller, which only needs to know *when*, not *what*. Nothing engraves before it
 * resolves: VexFlow measures glyphs in the DOM, and a render before the font is applied nails down
 * wrong coordinates in the SVG.
 */
export function notationFontsReady(): Promise<void> {
  return document.fonts.ready.then(() => undefined)
}
