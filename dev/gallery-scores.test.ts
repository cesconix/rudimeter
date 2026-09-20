import { describe, expect, it } from 'bun:test'
import { GALLERY, WORST_CASE } from './gallery-scores'

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
      'repeats',
      'endings',
      'simile',
      'tempo',
      'meters',
    ])
  })

  it('the worst case validates and is not a coverage row', () => {
    expect(WORST_CASE.id).toBe('worst-case')
    expect(GALLERY.some((f) => f.id === 'worst-case')).toBe(false)
  })

  it('the figures whose sentences name a barline pin their bars per row', () => {
    const pinned = Object.fromEntries(GALLERY.filter((f) => f.barsPerRow).map((f) => [f.id, f.barsPerRow]))
    expect(pinned).toEqual({ ties: 4, hairpins: 4 })
  })
})
