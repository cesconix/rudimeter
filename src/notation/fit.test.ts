import { describe, expect, it } from 'bun:test'
import type { Bar, Event, Item, Score } from '../score/types'
import { fit, type Pref } from './fit'
import { BAR_PAD, BARLINE_OVERHANG, FLAM_PX, HEAD_PX, NOTEHEAD_PX, rowBand } from './layout'

const AUTO: Pref = 'auto'
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
/** The same with a flam on the piece's first downbeat: the first bar of a row may keep room for it. */
const STONE_FLAM = (() => {
  const s = piece(2, 40)
  ;(s.bars[0].items[0] as Event).grace = { kind: 'flam' }
  return s
})()
/** The same with a flam on a later downbeat: any bar after the first on a row may keep room for it. */
const STONE_FLAM_LATER = (() => {
  const s = piece(2, 40)
  ;(s.bars[5].items[0] as Event).grace = { kind: 'flam' }
  return s
})()
/** Natural px of a row of `n` bars of 2/4: heads, pads and the end barline included. */
const rowOf = (n: number, bar = 192) => HEAD_PX + n * bar + (n - 1) * BAR_PAD + BARLINE_OVERHANG

describe('fit: bars per row', () => {
  // The widths of the old `fitLayout` table (iPhone portrait and landscape, iPad, desktop), read
  // under the rule that the fit never scales by itself: the row is the longest halving candidate
  // that fits at natural size, and the notehead stays 11.8 px on every one of them. Two bars of
  // 2/4 are 480 px, four 888, eight 1704.
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

  it('automatic: natural size whenever one bar fits, and the row it chose fits the width', () => {
    for (let availW = 300; availW <= 2000; availW += 20) {
      for (const beats of [2, 3, 4]) {
        const f = fit(availW, 600, AUTO, piece(beats, 40))
        const oneBar = rowOf(1, beats * 96)
        // Below one bar the fit shrinks to it (the narrow-phone exception); everywhere else the scale is 1.
        if (oneBar <= availW) expect(f.scale).toBe(1)
        else expect(f).toMatchObject({ barsPerRow: 1, scale: availW / oneBar })
        expect(rowOf(f.barsPerRow, beats * 96) * f.scale).toBeLessThanOrEqual(availW + 1e-9)
      }
    }
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
    // a bar of 4/4 (468 px) on a 375 px phone
    expect(fit(375, 600, AUTO, piece(4, 8)).scale).toBeCloseTo(375 / rowOf(1, 384), 5)
  })

  it('a fixed bars per row is a ceiling: fewer bars when asked, never more than fit, never a smaller scale', () => {
    // 1720 px, 2/4: eight bars fit (1704 px), two were asked for.
    expect(fit(1720, 600, 2, STONE)).toMatchObject({ barsPerRow: 2, scale: 1 })
    // 834 px: eight were asked for, two fit (480 px; four are 888).
    expect(fit(834, 600, 8, STONE)).toMatchObject({ barsPerRow: 2, scale: 1 })
    // Narrower than one bar: one bar, shrunk to fit, as in automatic.
    expect(fit(150, 600, 4, STONE)).toEqual(fit(150, 600, AUTO, STONE))
  })

  it('a flam on a downbeat takes width from the music: a bar fewer on the row, never a smaller scale', () => {
    // 500 px, 2/4: two bars are 480 px wide, 505 with the room a flam on the first one keeps.
    expect(fit(500, 600, AUTO, STONE)).toMatchObject({ barsPerRow: 2, scale: 1 })
    expect(fit(500, 600, AUTO, STONE_FLAM)).toMatchObject({ barsPerRow: 1, scale: 1 })
    expect(fit(rowOf(2) + FLAM_PX, 600, AUTO, STONE_FLAM)).toMatchObject({ barsPerRow: 2, scale: 1 })
  })

  it('every bar after the first on a row is bounded by the largest head a later bar of the piece takes', () => {
    // Four bars of 2/4 are 888 px; a flam on any later downbeat may land mid-row, so each of the three
    // bars after the first is bounded by BAR_PAD + FLAM_PX: 963 px.
    expect(fit(900, 600, AUTO, STONE)).toMatchObject({ barsPerRow: 4, scale: 1 })
    expect(fit(900, 600, AUTO, STONE_FLAM_LATER)).toMatchObject({ barsPerRow: 2, scale: 1 })
    expect(fit(rowOf(4) + 3 * FLAM_PX, 600, AUTO, STONE_FLAM_LATER)).toMatchObject({ barsPerRow: 4, scale: 1 })
  })
})

describe('fit: scale and rows', () => {
  it("a wide screen makes the music no bigger: the width is the layout's to fill, not the scale's", () => {
    const f = fit(4000, 4000, AUTO, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBe(1)
  })

  it("rows on screen: as many whole rows of the piece's band as the height holds at the scale, at least one", () => {
    const { systemH } = rowBand(STONE)
    expect(fit(847, 600, AUTO, STONE).rowsVisible).toBe(Math.floor(600 / systemH))
    const shrunk = fit(150, 600, AUTO, STONE)
    expect(shrunk.rowsVisible).toBe(Math.floor(600 / (shrunk.scale * systemH)))
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
    expect(fit(847, 600, Number.NaN, STONE)).toEqual(fit(847, 600, AUTO, STONE))
    expect(fit(847, 600, -2, STONE)).toEqual(fit(847, 600, AUTO, STONE))
  })
})
