import { describe, expect, it } from 'bun:test'
import { VoltaType } from 'vexflow/bravura'
import { keyForLine, voltaType } from './engrave'

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

  it('appends the notehead code VexFlow picks by duration, none for a normal head', () => {
    expect(keyForLine(2.5, 'normal')).toBe('c/5')
    expect(keyForLine(4.5, 'x')).toBe('g/5/x')
    expect(keyForLine(4.5, 'circle-x')).toBe('g/5/cx')
    expect(keyForLine(4, 'diamond')).toBe('f/5/di')
    expect(keyForLine(2.5, 'triangle')).toBe('c/5/tu')
    expect(keyForLine(2.5, 'slash')).toBe('c/5/s')
  })
})

describe('voltaType', () => {
  it('opens on the first bar of a bracket, closes on the last, both on a one-bar bracket, runs through the middle', () => {
    expect(voltaType({ first: true, last: false })).toBe(VoltaType.BEGIN)
    expect(voltaType({ first: false, last: true })).toBe(VoltaType.END)
    expect(voltaType({ first: true, last: true })).toBe(VoltaType.BEGIN_END)
    expect(voltaType({ first: false, last: false })).toBe(VoltaType.MID)
  })
})
