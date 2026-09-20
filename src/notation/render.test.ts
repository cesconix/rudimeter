import { describe, expect, it } from 'bun:test'
import { fitLayout, MIN_NOTEHEAD_PX, NATURAL_NOTEHEAD_PX } from './render'

// `fitLayout` is pure (no DOM, no VexFlow): it is the only part of the render verifiable here.
// The tests pin down the layout's PROPERTIES — musical anchoring, scale ceiling, readability
// floor — plus the table of values measured by hand in the browser on the real exercise, which is
// the only thing that tells apart a good rule from one that fills the screen with dots.
describe('fitLayout', () => {
  /** Notehead the user actually sees, rounded to the tenth like the on-screen measurements. */
  const notehead = (scale: number) => Math.round(NATURAL_NOTEHEAD_PX * scale * 10) / 10

  // Stick Control: 2/4, 2 bars per repeat, 20 repeats = 40 bars. Widths measured on real devices
  // (iPhone in portrait and landscape, iPad, desktop).
  it.each([
    [375, 2, 9.6],
    [390, 2, 10.0],
    [834, 4, 11.6],
    [844, 4, 11.8],
    [847, 4, 11.8],
    [1194, 6, 11.5],
    [1600, 8, 11.7],
  ])('at %p px: %p bars per row, notehead %p px', (availW, barsPerRow, head) => {
    const fit = fitLayout(availW, 2, 2, 40)
    expect(fit.barsPerRow).toBe(barsPerRow)
    expect(notehead(fit.scale)).toBe(head)
  })

  it('filling is not worth shrinking if a shorter row already fills', () => {
    // At 847px 4 bars take up 846px: they fill the screen at full size. Taking the next candidate
    // (6 bars) would cover the same width with 8.1px noteheads — the floor of unreadability — to
    // show one more repeat. The 10% margin is what prevents that.
    const fit = fitLayout(847, 2, 2, 40)
    expect(fit.barsPerRow).toBe(4)
    expect(fit.scale).toBe(1)
    expect(fit.systemH).toBe(140)
  })

  it('wide screen: the row is a multiple of the repeat', () => {
    for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
      const fit = fitLayout(4000, barsPerRepeat, 4, 40)
      expect(fit.barsPerRow % barsPerRepeat).toBe(0)
    }
  })

  it('the scale never exceeds the natural one', () => {
    for (const availW of [847, 1200, 2000, 4000, 10000]) {
      expect(fitLayout(availW, 8, 4, 40).scale).toBeLessThanOrEqual(1)
    }
  })

  it('narrow screen: it drops to half a repeat, no further and not at random', () => {
    // 900px in 4/4: 2 bars take up 846px (they fill), 4 would need 1614. The right answer is one
    // single value, 2 — a test that also accepted 1 would not tell apart a wrong rule.
    expect(fitLayout(900, 4, 4, 40).barsPerRow).toBe(2)
  })

  it('the row is never longer than the piece', () => {
    // Exercise without repeats: 2 bars in total on 928px. Packing 6 bars per row would draw the
    // music at 75% with two thirds of the staff empty, while having room for the natural size.
    const fit = fitLayout(928, 2, 2, 2)
    expect(fit.barsPerRow).toBe(2)
    expect(fit.scale).toBe(1)
  })

  it('invalid bars per repeat or total bars: a wrong row, never NaN', () => {
    // NaN is not visible here: it silently reaches renderer.resize(NaN, NaN) and leaves a blank
    // box with not a single line in the console.
    for (const [barsPerRepeat, totalBars] of [
      [0, 40],
      [2, 0],
      [-3, 40],
      [2.7, 40.9],
      [NaN, 40],
      [2, NaN],
    ]) {
      const fit = fitLayout(800, barsPerRepeat, 2, totalBars)
      expect(fit.barsPerRow).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(fit.barsPerRow)).toBe(true)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.systemH)).toBe(true)
    }
  })

  it('invalid available width: same fate, never NaN', () => {
    // The guard was already there for the other two parameters; this closes the same gate on the third.
    // Today `availW` comes from `clientWidth` and cannot be NaN, but `fitLayout` is exported.
    for (const availW of [NaN, Infinity, -Infinity, -100]) {
      const fit = fitLayout(availW, 2, 2, 40)
      expect(fit.barsPerRow).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.systemH)).toBe(true)
    }
  })

  it('the notehead never drops below the minimum readable size', () => {
    for (let availW = 480; availW <= 2000; availW += 20) {
      for (const beatsPerBar of [2, 3, 4]) {
        for (const barsPerRepeat of [1, 2, 3, 4, 8]) {
          const fit = fitLayout(availW, barsPerRepeat, beatsPerBar, 40)
          expect(NATURAL_NOTEHEAD_PX * fit.scale).toBeGreaterThanOrEqual(MIN_NOTEHEAD_PX)
        }
      }
    }
  })

  it('the grace-note gutter takes width away from the music, not from the scale', () => {
    // 468px, 2/4, 2 bars per repeat. Without a gutter 2 bars take up 462: they fit whole.
    // With the 24px the flam on the first beat needs, they become 486, and it shrinks to still
    // keep 2 — the alternative (dropping to 1) would waste half a row.
    expect(fitLayout(468, 2, 2, 40)).toMatchObject({ barsPerRow: 2, scale: 1 })
    const withGutter = fitLayout(468, 2, 2, 40, 24)
    expect(withGutter.barsPerRow).toBe(2)
    expect(withGutter.scale).toBeCloseTo(468 / 486, 3)
  })

  it('negative gutter: treated as absent, never a row wider than the true one', () => {
    expect(fitLayout(900, 2, 2, 40, -50)).toEqual(fitLayout(900, 2, 2, 40, 0))
  })

  it('at least one bar per row even on an absurd width', () => {
    // Below the width of one bar the readability floor is no longer tenable: it chooses to show
    // one unreadable bar instead of zero bars.
    const fit = fitLayout(10, 4, 4, 40)
    expect(fit.barsPerRow).toBe(1)
    expect(fit.scale).toBeGreaterThan(0)
    expect(fit.scale).toBeLessThan(1)
  })
})
