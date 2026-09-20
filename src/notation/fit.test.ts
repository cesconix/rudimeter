import { describe, expect, it } from 'bun:test'
import type { Bar, Event, Item, Score } from '../score/types'
import { fit, type Prefs } from './fit'
import { BAR_PAD, MIN_NOTEHEAD_PX, NOTEHEAD_PX, SYSTEM_H } from './layout'

const AUTO: Prefs = { barsPerRow: 'auto', rowsPerViewport: 'auto' }
/** Notehead the user sees, rounded to the tenth like the on-screen measurements. */
const notehead = (scale: number) => Math.round(NOTEHEAD_PX * scale * 10) / 10

const quarters = (beats: number): Item[] =>
  Array.from({ length: beats }, () => ({ duration: { base: 4 }, notes: [{ instrument: 'snare' }] }))
const piece = (beats: number, bars: number): Score => ({
  id: 'p',
  title: 'p',
  parts: [{ id: 'pad', kind: 'drumset' }],
  bars: Array.from(
    { length: bars },
    (_, i): Bar => ({
      ...(i === 0 ? { meter: [beats, 4] } : {}),
      parts: { pad: { voices: [{ stem: 'up', items: quarters(beats) }] } },
    }),
  ),
})

/** 40 written bars of 2/4, no grace notes. */
const STONE = piece(2, 40)
/** The same with a flam on the first beat: the grace gutter is paid. */
const STONE_FLAM = (() => {
  const s = piece(2, 40)
  ;(s.bars[0].parts?.pad.voices[0].items[0] as Event).grace = { kind: 'flam' }
  return s
})()

describe('fit: bars per row', () => {
  // The widths of the old `fitLayout` table, measured on real devices (iPhone portrait and
  // landscape, iPad, desktop) with HEAD_PX = 83. One row changed: at 1194 px the old rule took 6
  // bars at 11.5 px; six is no longer a candidate, and 8 bars fill the width at 8.2 px, above the
  // floor. Every notehead lost a few tenths when BAR_PAD (12 px between bars) joined the row width.
  it.each([
    [375, 2, 9.1],
    [390, 2, 9.4],
    [834, 4, 11.0],
    [844, 4, 11.1],
    [847, 4, 11.2],
    [1194, 8, 8.2],
    [1600, 8, 11.0],
  ])('at %p px: %p bars per row, notehead %p px', (availW, barsPerRow, head) => {
    const f = fit(availW, 600, AUTO, STONE)
    expect(f.barsPerRow).toBe(barsPerRow)
    expect(notehead(f.scale)).toBe(head)
  })

  it('automatic: the notehead never drops below the floor once a bar fits', () => {
    for (let availW = 480; availW <= 2000; availW += 20) {
      for (const beats of [2, 3, 4]) {
        const f = fit(availW, 600, AUTO, piece(beats, 40))
        expect(NOTEHEAD_PX * f.scale).toBeGreaterThanOrEqual(MIN_NOTEHEAD_PX)
      }
    }
  })

  it('the row is never longer than the piece', () => {
    // Two bars of 2/4 on 928 px: a row of 8 would draw the music at natural size with three quarters of the staff empty — and the number would reach the UI as "8".
    const f = fit(928, 600, AUTO, piece(2, 2))
    expect(f.barsPerRow).toBe(2)
    expect(f.scale).toBe(1)
  })

  it('narrower than one bar: one bar per row, shrunk past the floor rather than nothing', () => {
    const f = fit(150, 600, AUTO, STONE)
    expect(f.barsPerRow).toBe(1)
    expect(f.scale).toBeGreaterThan(0)
    expect(f.scale).toBeLessThan(1)
  })

  it('a fixed bars per row is taken as is, even wider than the screen', () => {
    const f = fit(400, 600, { barsPerRow: 8, rowsPerViewport: 'auto' }, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBeCloseTo(400 / (8 * 192 + 7 * BAR_PAD + 91), 5)
  })

  it('the grace gutter takes width from the music, not from the scale', () => {
    // 500 px, 2/4: two bars are 487 px wide (384 + 12 + 83 + 8) without the gutter and 511 with it
    // (384 + 12 + 83 + 24 + 8); the row keeps two bars and shrinks a little.
    expect(fit(500, 600, AUTO, STONE)).toMatchObject({ barsPerRow: 2, scale: 1 })
    const graced = fit(500, 600, AUTO, STONE_FLAM)
    expect(graced.barsPerRow).toBe(2)
    expect(graced.scale).toBeCloseTo(500 / 511, 5)
  })
})

describe('fit: scale and rows', () => {
  it('automatic everything: the scale caps at 1 — a wide screen makes the music big, not more readable', () => {
    const f = fit(4000, 4000, AUTO, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBe(1)
  })

  it('a fixed preference raises the cap to 1.5: the user asked for big notes', () => {
    expect(fit(4000, 4000, { barsPerRow: 2, rowsPerViewport: 'auto' }, STONE)).toMatchObject({
      barsPerRow: 2,
      scale: 1.5,
    })
    expect(fit(4000, 4000, { barsPerRow: 'auto', rowsPerViewport: 2 }, STONE).scale).toBe(1.5)
  })

  it('fixed rows per viewport: the scale shrinks until they fit, and that many are visible', () => {
    const f = fit(1600, 400, { barsPerRow: 'auto', rowsPerViewport: 4 }, STONE)
    expect(f.barsPerRow).toBe(8)
    expect(f.scale).toBeCloseTo(400 / (4 * SYSTEM_H), 5)
    expect(f.rowsVisible).toBe(4)
  })

  it('automatic rows per viewport: as many whole rows as the height holds, at least one', () => {
    expect(fit(847, 600, AUTO, STONE).rowsVisible).toBe(Math.floor(600 / SYSTEM_H))
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
    const bad = fit(847, 600, { barsPerRow: Number.NaN, rowsPerViewport: -2 }, STONE)
    expect(bad).toEqual(fit(847, 600, AUTO, STONE))
  })
})
