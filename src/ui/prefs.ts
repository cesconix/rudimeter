import type { KeyValueStore } from '../audio/storage'
import { clampBpm, DEFAULT_BPM } from '../audio/transport'
import type { Pref } from '../notation/fit'

export type ViewMode = 'scroll' | 'pages'

/** What the user fixed about the view, kept across sessions. Both layout preferences default to automatic (spec). */
export interface ViewPrefs {
  mode: ViewMode
  barsPerRow: Pref
  rowsPerViewport: Pref
  /** one bpm for every piece: the time map scales the piece's first tempo mark to it */
  bpm: number
}

export const PREFS_KEY = 'rudimeter.view'
export const DEFAULT_PREFS: ViewPrefs = {
  mode: 'scroll',
  barsPerRow: 'auto',
  rowsPerViewport: 'auto',
  bpm: DEFAULT_BPM,
}
export const BARS_PER_ROW_CHOICES: readonly Pref[] = ['auto', 1, 2, 4, 8]
export const ROWS_PER_VIEWPORT_CHOICES: readonly Pref[] = ['auto', 1, 2, 3, 4, 5, 6]

const pick = (choices: readonly Pref[], value: unknown, fallback: Pref): Pref =>
  choices.find((c) => c === value) ?? fallback

/**
 * Field by field, defaults for whatever is missing or malformed: the storage may hold anything —
 * an older shape, a hand edit, another app's key — and one bad field must not throw away the rest.
 */
export function parsePrefs(raw: string | null): ViewPrefs {
  if (!raw) return { ...DEFAULT_PREFS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_PREFS }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_PREFS }
  const p = parsed as Record<string, unknown>
  const bpm = typeof p.bpm === 'number' && p.bpm >= 1 ? clampBpm(p.bpm) : DEFAULT_PREFS.bpm
  return {
    mode: p.mode === 'pages' ? 'pages' : 'scroll',
    barsPerRow: pick(BARS_PER_ROW_CHOICES, p.barsPerRow, DEFAULT_PREFS.barsPerRow),
    rowsPerViewport: pick(ROWS_PER_VIEWPORT_CHOICES, p.rowsPerViewport, DEFAULT_PREFS.rowsPerViewport),
    bpm,
  }
}

/** `try`: in private Safari the storage throws, and a view with default preferences beats no view. */
export function loadPrefs(store: KeyValueStore): ViewPrefs {
  try {
    return parsePrefs(store.getItem(PREFS_KEY))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(store: KeyValueStore, prefs: ViewPrefs): void {
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storing them is a convenience, not a requirement: the view keeps the preferences in memory.
  }
}
