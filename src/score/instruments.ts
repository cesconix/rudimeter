import type { InstrumentId, InstrumentSpec, Score } from './types'

export type Catalogue = Record<InstrumentId, InstrumentSpec>

/**
 * The PAS / Weinberg standard positions (Guide to Standardized Drumset Notation). `line` counts
 * staff lines from the bottom: 0 the first line, halves the spaces, 5 the first ledger line above,
 * −0.5 the space below the staff. A piece transcribed from a book that prints differently overrides
 * the entries it needs (see `resolveInstruments`), the standard stays the default.
 */
export const CATALOGUE: Catalogue = {
  kick: { line: 0.5, head: 'normal', stem: 'down', name: 'Bass drum' },
  'hihat-pedal': { line: -0.5, head: 'x', stem: 'down', name: 'Hi-hat (foot)' },
  'tom-floor-low': { line: 0, head: 'normal', stem: 'up', name: 'Low floor tom' },
  'tom-floor': { line: 1.5, head: 'normal', stem: 'up', name: 'Floor tom' },
  snare: { line: 2.5, head: 'normal', stem: 'up', name: 'Snare' },
  'cross-stick': { line: 2.5, head: 'x', stem: 'up', name: 'Cross stick' },
  'tom-mid': { line: 3, head: 'normal', stem: 'up', name: 'Mid tom' },
  'tom-high': { line: 3.5, head: 'normal', stem: 'up', name: 'High tom' },
  ride: { line: 4, head: 'x', stem: 'up', name: 'Ride' },
  'ride-bell': { line: 4, head: 'diamond', stem: 'up', name: 'Ride bell' },
  hihat: { line: 4.5, head: 'x', stem: 'up', name: 'Hi-hat' },
  crash: { line: 5, head: 'x', stem: 'up', name: 'Crash' },
}

export const INSTRUMENT_IDS = Object.keys(CATALOGUE) as InstrumentId[]

/** The catalogue with the piece's overrides merged in, field by field. Every module downstream reads this, never `CATALOGUE`. */
export function resolveInstruments(score: Pick<Score, 'instruments'>): Catalogue {
  const out = { ...CATALOGUE }
  for (const id of INSTRUMENT_IDS) {
    const override = score.instruments?.[id]
    if (override) out[id] = { ...CATALOGUE[id], ...override }
  }
  return out
}
