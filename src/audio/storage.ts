export interface CalibrationData {
  latencyMs: number
  slope: number | null
  deviceLabel: string
  savedAt: string
}

/** Subset of Storage: localStorage satisfies it, the tests use a Map. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const KEY = 'stick-coach.calibration.v1'

export function loadCalibration(store: KeyValueStore): CalibrationData | null {
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<CalibrationData>
    if (typeof d.latencyMs !== 'number') return null
    return {
      latencyMs: d.latencyMs,
      slope: typeof d.slope === 'number' ? d.slope : null,
      deviceLabel: d.deviceLabel ?? '',
      savedAt: d.savedAt ?? '',
    }
  } catch {
    return null
  }
}

export function saveCalibration(store: KeyValueStore, data: CalibrationData): void {
  store.setItem(KEY, JSON.stringify(data))
}

export function clearCalibration(store: KeyValueStore): void {
  store.removeItem(KEY)
}

/** A store that forgets on reload: a synthetic run must never leave its fake latency where the real one lives. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
    removeItem: (k) => {
      m.delete(k)
    },
  }
}
