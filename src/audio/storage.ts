export interface CalibrationData {
  latencyMs: number
  slope: number | null
  deviceLabel: string
  savedAt: string
}

/** Sottoinsieme di Storage: localStorage lo soddisfa, i test usano una Map. */
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
    return { latencyMs: d.latencyMs, slope: typeof d.slope === 'number' ? d.slope : null, deviceLabel: d.deviceLabel ?? '', savedAt: d.savedAt ?? '' }
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
