import { describe, expect, it } from 'bun:test'
import { clearCalibration, loadCalibration, memoryStore, saveCalibration } from './storage'

describe('calibration storage', () => {
  it('saves and reads back', () => {
    const s = memoryStore()
    const data = { latencyMs: 68, slope: 0.98, deviceLabel: 'iPad Microphone', savedAt: '2026-09-07T10:00:00.000Z' }
    saveCalibration(s, data)
    expect(loadCalibration(s)).toEqual(data)
  })
  it('null if absent, corrupted or without a numeric latency', () => {
    const s = memoryStore()
    expect(loadCalibration(s)).toBeNull()
    s.setItem('rudimeter.calibration.v1', '{not json')
    expect(loadCalibration(s)).toBeNull()
    s.setItem('rudimeter.calibration.v1', JSON.stringify({ slope: 1 }))
    expect(loadCalibration(s)).toBeNull()
  })
  it('clear removes', () => {
    const s = memoryStore()
    saveCalibration(s, { latencyMs: 1, slope: null, deviceLabel: '', savedAt: '' })
    clearCalibration(s)
    expect(loadCalibration(s)).toBeNull()
  })
})

describe('memoryStore', () => {
  it('starts empty, keeps what it is given and forgets on removal', () => {
    const s = memoryStore()
    expect(s.getItem('k')).toBeNull()
    s.setItem('k', 'v')
    expect(s.getItem('k')).toBe('v')
    s.removeItem('k')
    expect(s.getItem('k')).toBeNull()
  })
})
