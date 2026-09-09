import { describe, expect, it } from 'bun:test'
import { clearCalibration, type KeyValueStore, loadCalibration, saveCalibration } from './storage'

function fakeStore(): KeyValueStore {
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

describe('calibration storage', () => {
  it('salva e rilegge', () => {
    const s = fakeStore()
    const data = { latencyMs: 68, slope: 0.98, deviceLabel: 'iPad Microphone', savedAt: '2026-09-07T10:00:00.000Z' }
    saveCalibration(s, data)
    expect(loadCalibration(s)).toEqual(data)
  })
  it('null se assente, corrotto o senza latenza numerica', () => {
    const s = fakeStore()
    expect(loadCalibration(s)).toBeNull()
    s.setItem('stick-coach.calibration.v1', '{not json')
    expect(loadCalibration(s)).toBeNull()
    s.setItem('stick-coach.calibration.v1', JSON.stringify({ slope: 1 }))
    expect(loadCalibration(s)).toBeNull()
  })
  it('clear rimuove', () => {
    const s = fakeStore()
    saveCalibration(s, { latencyMs: 1, slope: null, deviceLabel: '', savedAt: '' })
    clearCalibration(s)
    expect(loadCalibration(s)).toBeNull()
  })
})
