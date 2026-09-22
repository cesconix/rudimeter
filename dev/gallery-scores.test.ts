import { describe, expect, it } from 'bun:test'
import { flattenBar } from '../src/score/events'
import { isTuplet } from '../src/score/types'
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

  it('the worst case stacks every mark the band must fit, on two rows', () => {
    const { bars } = WORST_CASE.score
    const events = bars.flatMap(flattenBar).map((f) => f.event)
    expect(bars).toHaveLength(4)
    expect(WORST_CASE.barsPerRow).toBe(2)
    expect(events.some((e) => e.text === 'Flam accent' && e.grace?.kind === 'drag' && e.accent)).toBe(true)
    expect(events.some((e) => e.grace?.kind === 'flam' && e.accent)).toBe(true)
    expect(events.some((e) => e.roll?.kind === 'tremolo' && e.roll.slashes === 3 && e.accent)).toBe(true)
    expect(events.some((e) => e.roll?.kind === 'buzz' && e.accent)).toBe(true)
    expect(events.some((e) => e.rest && e.text)).toBe(true)
    expect(events.filter((e) => e.tie)).toHaveLength(2)
    // Every stroke carries its sticking, so the band's bottom is the letters under every kind of note.
    expect(events.filter((e) => !e.rest).every((e) => e.sticking)).toBe(true)
    const tuplets = bars.flatMap((b) => b.items.filter(isTuplet).map((t) => t.tuplet.actual))
    expect(new Set(tuplets)).toEqual(new Set([3, 4, 5, 6, 7]))
    expect(bars[2].meter).toEqual([12, 8])
    expect(bars.map((b) => b.repeat)).toEqual([
      { start: true },
      { end: { times: 3 } },
      { start: true },
      { end: { times: 4 } },
    ])
  })

  it('the figures whose sentences name a barline pin their bars per row', () => {
    const pinned = Object.fromEntries(GALLERY.filter((f) => f.barsPerRow).map((f) => [f.id, f.barsPerRow]))
    expect(pinned).toEqual({ ties: 4, meters: 2 })
  })
})
