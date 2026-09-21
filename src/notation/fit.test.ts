import { describe, expect, it } from 'bun:test'
import type { Bar, Event, Item, Score } from '../score/types'
import { fit, type Prefs } from './fit'
import { BAR_PAD, GRACE_GUTTER, HEAD_PX, NOTEHEAD_PX, RIGHT_PAD, SYSTEM_H } from './layout'

const AUTO: Prefs = { barsPerRow: 'auto', zoom: 1 }
/** Notehead the user sees, rounded to the tenth like the on-screen measurements. */
const notehead = (scale: number) => Math.round(NOTEHEAD_PX * scale * 10) / 10

const quarters = (beats: number): Item[] => Array.from({ length: beats }, () => ({ duration: { base: 4 } }))
const piece = (beats: number, bars: number): Score => ({
  id: 'p',
  title: 'p',
  bars: Array.from(
    { length: bars },
    (_, i): Bar => ({ ...(i === 0 ? { meter: [beats, 4] } : {}), items: quarters(beats) }),
  ),
})

/** 40 written bars of 2/4, no grace notes. */
const STONE = piece(2, 40)
/** The same with a flam on the first beat: the grace gutter is paid. */
const STONE_FLAM = (() => {
  const s = piece(2, 40)
  ;(s.bars[0].items[0] as Event).grace = { kind: 'flam' }
  return s
})()
/** Natural px of a row of `n` bars of 2/4: heads, pads and the right pad included. */
const rowOf = (n: number, bar = 192) => HEAD_PX + n * bar + (n - 1) * BAR_PAD + RIGHT_PAD

describe('fit: bars per row', () => {
  // The widths of the old `fitLayout` table (iPhone portrait and landscape, iPad, desktop), read
  // under the rule that the fit never scales by itself: the row is the longest halving candidate
  // that fits at natural size, and the notehead stays 11.8 px on every one of them. Two bars of
  // 2/4 are 487 px, four 895, eight 1711.
  it.each([
    [375, 1],
    [390, 1],
    [834, 2],
    [844, 2],
    [847, 2],
    [1194, 4],
    [1600, 4],
    [1720, 8],
  ])('at %p px: %p bars per row at natural size', (availW, barsPerRow) => {
    const f = fit(availW, 600, AUTO, STONE)
    expect(f.barsPerRow).toBe(barsPerRow)
    expect(f.scale).toBe(1)
    expect(notehead(f.scale)).toBe(11.8)
  })

  it('automatic: the scale is the zoom whenever one bar fits at it, and the row it chose fits the width', () => {
    for (let availW = 300; availW <= 2000; availW += 20) {
      for (const beats of [2, 3, 4]) {
        for (const zoom of [0.75, 1, 1.5]) {
          const f = fit(availW, 600, { barsPerRow: 'auto', zoom }, piece(beats, 40))
          const oneBar = rowOf(1, beats * 96)
          // Below one bar the fit shrinks to it (the narrow-phone exception); everywhere else it never touches the zoom.
          if (oneBar * zoom <= availW) expect(f.scale).toBe(zoom)
          else expect(f).toMatchObject({ barsPerRow: 1, scale: availW / oneBar })
          expect(rowOf(f.barsPerRow, beats * 96) * f.scale).toBeLessThanOrEqual(availW + 1e-9)
        }
      }
    }
  })

  it('the zoom changes how many bars fit, never the size the music is drawn at', () => {
    // 834 px, 2/4: two bars at 1× (487 px) and still two at 1.5× (730 px); at 2× two are 974 px, so one.
    expect(fit(834, 600, { barsPerRow: 'auto', zoom: 1.5 }, STONE)).toMatchObject({ barsPerRow: 2, scale: 1.5 })
    expect(fit(834, 600, { barsPerRow: 'auto', zoom: 2 }, STONE)).toMatchObject({ barsPerRow: 1, scale: 2 })
    expect(fit(834, 600, { barsPerRow: 'auto', zoom: 0.75 }, STONE)).toMatchObject({ barsPerRow: 4, scale: 0.75 })
  })

  it('the row is never longer than the piece', () => {
    // Two bars of 2/4 on 928 px: a row of 8 would draw the music at natural size with three quarters of the staff empty — and the number would reach the UI as "8".
    const f = fit(928, 600, AUTO, piece(2, 2))
    expect(f.barsPerRow).toBe(2)
    expect(f.scale).toBe(1)
  })

  it('narrower than one bar: one bar per row, shrunk to fit — the one scaling the fit does on its own', () => {
    const f = fit(150, 600, AUTO, STONE)
    expect(f.barsPerRow).toBe(1)
    expect(f.scale).toBeCloseTo(150 / rowOf(1), 5)
    // a bar of 4/4 (475 px) on a 375 px phone
    expect(fit(375, 600, AUTO, piece(4, 8)).scale).toBeCloseTo(375 / rowOf(1, 384), 5)
  })

  it('a fixed bars per row is taken as is: it keeps the zoom when it fits, and shrinks to fit when it does not', () => {
    expect(fit(1600, 600, { barsPerRow: 2, zoom: 1.5 }, STONE)).toMatchObject({ barsPerRow: 2, scale: 1.5 })
    const f = fit(400, 600, { barsPerRow: 8, zoom: 1 }, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBeCloseTo(400 / rowOf(8), 5)
  })

  it('the grace gutter takes width from the music: a bar fewer on the row, never a smaller scale', () => {
    // 500 px, 2/4: two bars are 487 px wide without the gutter and 511 with it.
    expect(fit(500, 600, AUTO, STONE)).toMatchObject({ barsPerRow: 2, scale: 1 })
    expect(fit(500, 600, AUTO, STONE_FLAM)).toMatchObject({ barsPerRow: 1, scale: 1 })
    expect(fit(rowOf(2) + GRACE_GUTTER, 600, AUTO, STONE_FLAM)).toMatchObject({ barsPerRow: 2, scale: 1 })
  })
})

describe('fit: scale and rows', () => {
  it("a wide screen makes the music no bigger: the width is the layout's to fill, not the scale's", () => {
    const f = fit(4000, 4000, AUTO, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBe(1)
  })

  it('rows on screen: as many whole rows as the height holds at the scale, at least one', () => {
    expect(fit(847, 600, AUTO, STONE).rowsVisible).toBe(Math.floor(600 / SYSTEM_H))
    expect(fit(847, 600, { barsPerRow: 'auto', zoom: 0.75 }, STONE).rowsVisible).toBe(
      Math.floor(600 / (0.75 * SYSTEM_H)),
    )
    expect(fit(847, 600, { barsPerRow: 'auto', zoom: 2 }, STONE).rowsVisible).toBe(Math.floor(600 / (2 * SYSTEM_H)))
    expect(fit(847, 50, AUTO, STONE).rowsVisible).toBe(1)
  })

  it('non-finite or negative inputs: a wrong row, never NaN', () => {
    // NaN is invisible here: it reaches renderer.resize(NaN, NaN) and leaves a blank box with nothing in the console.
    for (const availW of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -100, 0]) {
      for (const availH of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 600]) {
        const f = fit(availW, availH, AUTO, STONE)
        expect(f.barsPerRow).toBeGreaterThanOrEqual(1)
        expect(Number.isFinite(f.scale)).toBe(true)
        expect(f.scale).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(f.rowsVisible)).toBe(true)
        expect(f.rowsVisible).toBeGreaterThanOrEqual(1)
      }
    }
    const bad = fit(847, 600, { barsPerRow: Number.NaN, zoom: Number.NaN }, STONE)
    expect(bad).toEqual(fit(847, 600, AUTO, STONE))
    expect(fit(847, 600, { barsPerRow: 'auto', zoom: -2 }, STONE)).toEqual(fit(847, 600, AUTO, STONE))
  })
})
