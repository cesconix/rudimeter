import { describe, expect, it } from 'bun:test'
import { keyForLine } from './engrave'

// `engraveRow` needs a DOM (VexFlow measures glyphs by reading it): it is checked in the gallery.
// The key mapping is arithmetic, and a wrong line here is every note on the wrong space.
describe('keyForLine', () => {
  it.each([
    [-0.5, 'd/4'],
    [0, 'e/4'],
    [0.5, 'f/4'],
    [1, 'g/4'],
    [1.5, 'a/4'],
    [2, 'b/4'],
    [2.5, 'c/5'],
    [3, 'd/5'],
    [3.5, 'e/5'],
    [4, 'f/5'],
    [4.5, 'g/5'],
    [5, 'a/5'],
  ])('line %p → %p on the percussion clef', (line, key) => {
    expect(keyForLine(line)).toBe(key)
  })
})
