import { describe, expect, it } from 'bun:test'
import { GALLERY } from './gallery-scores'

// Importing the module already runs every figure through `parseScore`; this pins the rest.
describe('gallery scores', () => {
  it('every figure validates, has a unique id and a sentence to check it against', () => {
    const ids = GALLERY.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const f of GALLERY) {
      expect(f.score.id).toBe(f.id)
      expect(f.expect.length).toBeGreaterThan(20)
    }
  })

  it('covers the rows of the table drawn so far', () => {
    expect(GALLERY.map((f) => f.id)).toEqual([
      'values',
      'rests',
      'tuplets',
      'voices',
      'noteheads',
      'head',
      'ghost',
      'accents',
      'open-closed',
      'grace',
      'rolls',
      'sticking',
      'dynamics',
      'hairpins',
      'ties',
      'text',
    ])
  })
})
