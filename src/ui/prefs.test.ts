import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import {
  BARS_PER_ROW_CHOICES,
  DEFAULT_PREFS,
  loadPrefs,
  PREFS_KEY,
  parsePrefs,
  ROWS_PER_VIEWPORT_CHOICES,
  savePrefs,
} from './prefs'

// Task 6 (the transport bar) reads these two to build its bars-per-row and rows-per-viewport
// controls; pinned here so the choices they offer are covered before that consumer lands.
describe('BARS_PER_ROW_CHOICES / ROWS_PER_VIEWPORT_CHOICES', () => {
  it('list the choices a control offers, defaulting to auto', () => {
    expect(BARS_PER_ROW_CHOICES).toEqual(['auto', 1, 2, 4, 8])
    expect(ROWS_PER_VIEWPORT_CHOICES).toEqual(['auto', 1, 2, 3, 4, 5, 6])
  })
})

describe('parsePrefs', () => {
  it('reads a stored object field by field', () => {
    expect(parsePrefs(JSON.stringify({ mode: 'pages', barsPerRow: 2, rowsPerViewport: 3, bpm: 84 }))).toEqual({
      mode: 'pages',
      barsPerRow: 2,
      rowsPerViewport: 3,
      bpm: 84,
    })
  })

  it('falls back to the defaults on nothing, garbage, and on each malformed field alone', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[1, 2]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ mode: 'diagonal', barsPerRow: 3, rowsPerViewport: 0, bpm: 'fast' }))).toEqual(
      DEFAULT_PREFS,
    )
    // a valid field next to a broken one survives
    expect(parsePrefs(JSON.stringify({ mode: 'pages', bpm: -5 }))).toEqual({ ...DEFAULT_PREFS, mode: 'pages' })
  })

  it('bpm is rounded and clamped like the transport clamps it', () => {
    expect(parsePrefs(JSON.stringify({ bpm: 90.6 })).bpm).toBe(91)
    expect(parsePrefs(JSON.stringify({ bpm: 1000 })).bpm).toBe(300)
  })
})

describe('loadPrefs / savePrefs', () => {
  it('round-trips through a store under the one key', () => {
    const store = memoryStore()
    const prefs = { ...DEFAULT_PREFS, mode: 'pages' as const, bpm: 72 }
    savePrefs(store, prefs)
    expect(store.getItem(PREFS_KEY)).toBe(JSON.stringify(prefs))
    expect(loadPrefs(store)).toEqual(prefs)
  })

  it('a store that throws (private Safari) is a store with nothing in it', () => {
    const broken = {
      getItem: () => {
        throw new Error('QuotaExceededError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS)
    expect(() => savePrefs(broken, DEFAULT_PREFS)).not.toThrow()
  })
})
