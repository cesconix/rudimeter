import { barLength, metersOf } from '../score/events'
import { toNumber } from '../score/fraction'
import type { Score } from '../score/types'
import { BAR_PAD, GRACE_GUTTER, HEAD_PX, hasGrace, PX_PER_WHOLE, SIDE_PAD, SYSTEM_H } from './layout'

export type Pref = number | 'auto'
export interface Prefs {
  barsPerRow: Pref
  /** the user's magnification of the natural size: 1 draws the music as designed, and it is the only size the fit picks on its own */
  zoom: number
}
export interface Fit {
  barsPerRow: number
  scale: number
  rowsVisible: number
}

/** Row lengths the automatic layout chooses from: halving keeps a two-bar pattern whole on the row. */
const CANDIDATES = [8, 4, 2, 1]

/** A preference that is not a positive number is automatic: the storage (plan 11) may hand back anything. */
const pref = (p: Pref): number | 'auto' => (p === 'auto' || !Number.isFinite(p) || p < 1 ? 'auto' : Math.floor(p))

/**
 * Bars per row, scale and rows on screen, from the space and the user's preferences.
 *
 * The music is drawn at its natural size times the user's zoom, and nothing else decides the size.
 * Automatic bars per row is the longest candidate whose widest possible row — that many bars of the
 * piece's largest meter, heads, pads and side pads included — fits the width at that zoom, never
 * more bars than the piece has; the width left over is the layout's to fill, by stretching the time
 * grid (`buildLayout`, `fillWidth`), never the scale's. Halving candidates keep a two-bar pattern
 * whole on the row.
 *
 * The one scaling the fit does by itself is downward, when the row it must draw does not fit: a
 * single bar wider than a phone, or the bars per row the user fixed — they asked for that many on
 * one row, and the zoom yields to the more specific wish.
 *
 * Rows on screen follow from the height and the scale: as many whole rows as fit, at least one.
 *
 * Non-finite inputs are clamped, as the old `fitLayout` did: a NaN here reaches
 * `renderer.resize(NaN, NaN)` and leaves a blank box with nothing in the console.
 */
export function fit(availW: number, availH: number, prefs: Prefs, score: Score): Fit {
  const w = Number.isFinite(availW) ? Math.max(0, availW) : 0
  const h = Number.isFinite(availH) ? Math.max(0, availH) : 0
  const bars = pref(prefs.barsPerRow)
  const zoom = Number.isFinite(prefs.zoom) && prefs.zoom > 0 ? prefs.zoom : 1
  const total = Math.max(1, score.bars.length)
  const gridX0 = HEAD_PX + (hasGrace(score) ? GRACE_GUTTER : 0)
  // `|| PX_PER_WHOLE`: a piece with no bars has no meter; it does not happen past `parseScore`, but the function is exported.
  const widestBar = Math.max(0, ...metersOf(score).map((m) => toNumber(barLength(m)))) * PX_PER_WHOLE || PX_PER_WHOLE
  // Every bar after the first on a row starts with `BAR_PAD` of air before its grid.
  const widestRow = (n: number) => Math.min(n, total) * (widestBar + BAR_PAD) - BAR_PAD + gridX0 + 2 * SIDE_PAD
  const fits = (n: number) => widestRow(n) * zoom <= w
  const barsPerRow = bars === 'auto' ? Math.min(total, CANDIDATES.find(fits) ?? 1) : bars
  const scale = Math.min(zoom, w / widestRow(barsPerRow))
  const rowsVisible = scale > 0 ? Math.max(1, Math.floor(h / (SYSTEM_H * scale))) : 1
  return { barsPerRow, scale, rowsVisible }
}
