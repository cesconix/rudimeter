import { barLength, metersOf } from '../score/events'
import { toNumber } from '../score/fraction'
import type { Score } from '../score/types'
import {
  GRACE_GUTTER,
  HEAD_PX,
  hasGrace,
  MIN_NOTEHEAD_PX,
  NOTEHEAD_PX,
  PX_PER_WHOLE,
  RIGHT_PAD,
  SYSTEM_H,
} from './layout'

export type Pref = number | 'auto'
export interface Prefs {
  barsPerRow: Pref
  rowsPerViewport: Pref
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
 * Automatic bars per row is the longest candidate whose widest possible row — that many bars of
 * the piece's largest meter, head and right pad included — still shows a readable notehead once
 * shrunk into `availW`, and never more bars than the piece has. Halving candidates make this the
 * same choice the old `fitLayout` made ("fill the width unless a shorter row already fills it"):
 * a shorter row that fills 90% of the width leaves the next one at half scale, under the floor.
 *
 * The scale then fills the width, or the height when rows per viewport is fixed, capped at 1 when
 * everything is automatic (big is not more readable) and at 1.5 when the user fixed something
 * (they asked for big notes).
 *
 * Non-finite inputs are clamped, as the old `fitLayout` did: a NaN here reaches
 * `renderer.resize(NaN, NaN)` and leaves a blank box with nothing in the console.
 */
export function fit(availW: number, availH: number, prefs: Prefs, score: Score): Fit {
  const w = Number.isFinite(availW) ? Math.max(0, availW) : 0
  const h = Number.isFinite(availH) ? Math.max(0, availH) : 0
  const bars = pref(prefs.barsPerRow)
  const rows = pref(prefs.rowsPerViewport)
  const total = Math.max(1, score.bars.length)
  const gridX0 = HEAD_PX + (hasGrace(score) ? GRACE_GUTTER : 0)
  // `|| PX_PER_WHOLE`: a piece with no bars has no meter; it does not happen past `parseScore`, but the function is exported.
  const widestBar = Math.max(0, ...metersOf(score).map((m) => toNumber(barLength(m)))) * PX_PER_WHOLE || PX_PER_WHOLE
  const widestRow = (n: number) => Math.min(n, total) * widestBar + gridX0 + RIGHT_PAD
  const readable = (n: number) => NOTEHEAD_PX * Math.min(1, w / widestRow(n)) >= MIN_NOTEHEAD_PX
  const barsPerRow = bars === 'auto' ? Math.min(total, CANDIDATES.find(readable) ?? 1) : bars
  const scaleW = w / widestRow(barsPerRow)
  const scaleH = rows === 'auto' ? Number.POSITIVE_INFINITY : h / (rows * SYSTEM_H)
  const cap = bars === 'auto' && rows === 'auto' ? 1 : 1.5
  const scale = Math.min(scaleW, scaleH, cap)
  const rowsVisible = rows === 'auto' ? (scale > 0 ? Math.max(1, Math.floor(h / (SYSTEM_H * scale))) : 1) : rows
  return { barsPerRow, scale, rowsVisible }
}
