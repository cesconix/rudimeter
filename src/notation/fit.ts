import { barLength, metersOf } from '../score/events'
import { toNumber } from '../score/fraction'
import type { Score } from '../score/types'
import { BAR_PAD, BARLINE_OVERHANG, GRACE_GUTTER, HEAD_PX, hasGrace, PX_PER_WHOLE, SYSTEM_H } from './layout'

export type Pref = number | 'auto'
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
 * Bars per row, scale and rows on screen, from the space and the user's bars per row.
 *
 * The music is drawn at its natural size: every user sees every glyph at the same size, and neither
 * the width nor a preference changes it. Bars per row is the longest candidate whose widest possible
 * row — that many bars of the piece's largest meter, heads, pads and the end barline included —
 * fits the width, never more bars than the piece has; the width left over is the layout's to fill,
 * by stretching the time grid (`buildLayout`, `fillWidth`), never the scale's. Halving candidates
 * keep a two-bar pattern whole on the row. A number the user fixed is a ceiling on that: fewer bars
 * when they ask for fewer, never more than fit.
 *
 * The one scaling is downward, when a single bar is wider than the space (a bar of 4/4 is 468 px,
 * wider than a phone or a narrow Split View): that bar is shrunk to fit.
 *
 * Rows on screen follow from the height and the scale: as many whole rows as fit, at least one.
 *
 * Non-finite inputs are clamped, as the old `fitLayout` did: a NaN here reaches
 * `renderer.resize(NaN, NaN)` and leaves a blank box with nothing in the console.
 */
export function fit(availW: number, availH: number, barsPerRowPref: Pref, score: Score): Fit {
  const w = Number.isFinite(availW) ? Math.max(0, availW) : 0
  const h = Number.isFinite(availH) ? Math.max(0, availH) : 0
  const bars = pref(barsPerRowPref)
  const total = Math.max(1, score.bars.length)
  const gridX0 = HEAD_PX + (hasGrace(score) ? GRACE_GUTTER : 0)
  // `|| PX_PER_WHOLE`: a piece with no bars has no meter; it does not happen past `parseScore`, but the function is exported.
  const widestBar = Math.max(0, ...metersOf(score).map((m) => toNumber(barLength(m)))) * PX_PER_WHOLE || PX_PER_WHOLE
  // Every bar after the first on a row starts with `BAR_PAD` of air before its grid.
  const widestRow = (n: number) => Math.min(n, total) * (widestBar + BAR_PAD) - BAR_PAD + gridX0 + BARLINE_OVERHANG
  const fitting = Math.min(total, CANDIDATES.find((n) => widestRow(n) <= w) ?? 1)
  const barsPerRow = bars === 'auto' ? fitting : Math.min(bars, fitting)
  // Below 1 only when `barsPerRow` is 1 and that bar is wider than the space: every longer row fits by construction.
  const scale = Math.min(1, w / widestRow(barsPerRow))
  const rowsVisible = scale > 0 ? Math.max(1, Math.floor(h / (SYSTEM_H * scale))) : 1
  return { barsPerRow, scale, rowsVisible }
}
