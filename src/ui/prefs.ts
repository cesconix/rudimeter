import type { KeyValueStore } from '../audio/storage'
import { clampBpm, DEFAULT_BPM } from '../audio/transport'
import type { Pref } from '../notation/fit'

export type ViewMode = 'scroll' | 'pages'

/** What the user fixed about the view, kept across sessions. Both layout preferences default to automatic (spec). */
export interface ViewPrefs {
  mode: ViewMode
  /** a ceiling on the bars that fit (`fit`): the music is always drawn at its natural size */
  barsPerRow: Pref
  /** one bpm for every piece: it counts the beat of the meter (`beatOf` in the time map), so every piece runs at it */
  bpm: number
}

export const PREFS_KEY = 'rudimeter.view'
export const DEFAULT_PREFS: ViewPrefs = {
  mode: 'scroll',
  barsPerRow: 'auto',
  bpm: DEFAULT_BPM,
}
export const BARS_PER_ROW_CHOICES: readonly Pref[] = ['auto', 1, 2, 4, 8]

const pick = <T>(choices: readonly T[], value: unknown, fallback: T): T => choices.find((c) => c === value) ?? fallback

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
  // A stored bpm below 1 (a negative, a zero) is malformed, not a low tempo: it falls all the way
  // to the default rather than being clamped up to MIN_BPM, the same way any other broken field does.
  const bpm = typeof p.bpm === 'number' && p.bpm >= 1 ? clampBpm(p.bpm) : DEFAULT_PREFS.bpm
  return {
    mode: p.mode === 'pages' ? 'pages' : 'scroll',
    barsPerRow: pick(BARS_PER_ROW_CHOICES, p.barsPerRow, DEFAULT_PREFS.barsPerRow),
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
