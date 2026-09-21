import { describe, expect, it } from 'bun:test'
import { flattenBar } from '../src/score/events'
import { CURSOR_PROBE, GALLERY, WORST_CASE } from './gallery-scores'

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

  it('is the twelve notations of the pad, in the order of the spec', () => {
    expect(GALLERY.map((f) => f.id)).toEqual([
      'values',
      'rests',
      'tuplets',
      'head',
      'accents',
      'grace',
      'rolls',
      'sticking',
      'ties',
      'text',
      'repeats',
      'meters',
    ])
  })

  it('the worst case and the cursor probe validate and are not coverage rows', () => {
    expect(WORST_CASE.id).toBe('worst-case')
    expect(CURSOR_PROBE.id).toBe('cursor-probe')
    expect(GALLERY.some((f) => f.id === 'worst-case' || f.id === 'cursor-probe')).toBe(false)
    // The probe: two bars of 1/4, a quarter with R in each — the second bar is the one measured.
    expect(CURSOR_PROBE.score.bars.map((b) => flattenBar(b).map((f) => f.event.sticking))).toEqual([['R'], ['R']])
    expect(CURSOR_PROBE.score.bars[0].meter).toEqual([1, 4])
  })

  it('the worst case holds the cheese and every mark the band must fit', () => {
    const events = WORST_CASE.score.bars.flatMap(flattenBar).map((f) => f.event)
    expect(events.some((e) => e.text === 'Flam accent')).toBe(true)
    expect(events.some((e) => e.grace?.kind === 'flam' && e.accent)).toBe(true)
    expect(events.some((e) => e.grace?.kind === 'drag')).toBe(true)
    expect(events.some((e) => e.roll?.kind === 'tremolo' && e.roll.slashes === 3 && e.accent)).toBe(true)
    expect(events.some((e) => e.roll?.kind === 'buzz' && e.accent)).toBe(true)
    expect(events.filter((e) => e.duration.base === 32)).toHaveLength(8)
    expect(WORST_CASE.score.bars[1].repeat).toEqual({ end: { times: 3 } })
  })

  it('the figures whose sentences name a barline pin their bars per row', () => {
    const pinned = Object.fromEntries(GALLERY.filter((f) => f.barsPerRow).map((f) => [f.id, f.barsPerRow]))
    expect(pinned).toEqual({ ties: 4, meters: 2 })
  })
})
