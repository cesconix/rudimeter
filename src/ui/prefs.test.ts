import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import { BARS_PER_ROW_CHOICES, DEFAULT_PREFS, loadPrefs, PREFS_KEY, parsePrefs, savePrefs } from './prefs'

// The transport bar reads this to build its bars-per-row control; pinned here so the choices it
// offers are covered next to the parser that accepts them.
describe('BARS_PER_ROW_CHOICES', () => {
  it('lists the choices the control offers, automatic by default', () => {
    expect(BARS_PER_ROW_CHOICES).toEqual(['auto', 1, 2, 4, 8])
    expect(DEFAULT_PREFS.barsPerRow).toBe('auto')
  })
})

describe('parsePrefs', () => {
  it('reads a stored object field by field', () => {
    expect(parsePrefs(JSON.stringify({ mode: 'pages', barsPerRow: 2, bpm: 84 }))).toEqual({
      mode: 'pages',
      barsPerRow: 2,
      bpm: 84,
    })
  })

  it('falls back to the defaults on nothing, garbage, and on each malformed field alone', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[1, 2]')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ mode: 'diagonal', barsPerRow: 3, bpm: 'fast' }))).toEqual(DEFAULT_PREFS)
    // a valid field next to a broken one survives
    expect(parsePrefs(JSON.stringify({ mode: 'pages', bpm: -5 }))).toEqual({ ...DEFAULT_PREFS, mode: 'pages' })
    // the fields of previous shapes — rows per screen, the zoom — are ignored, the rest read
    expect(parsePrefs(JSON.stringify({ mode: 'pages', rowsPerViewport: 3, zoom: 1.5, bpm: 84 }))).toEqual({
      ...DEFAULT_PREFS,
      mode: 'pages',
      bpm: 84,
    })
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
