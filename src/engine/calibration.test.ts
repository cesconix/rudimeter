import { describe, expect, it } from 'vitest'
import { dynamicsVerdict, fitRamp, latencyFromOffsets, matchOffsets, median, rampGainsDb } from './calibration'

describe('matchOffsets', () => {
  it('abbina a ogni click il primo onset entro 300 ms e ritorna gli offset in ms', () => {
    const clicks = [1, 1.5, 2, 2.5]
    const onsets = [1.068, 1.568, 2.9]
    expect(matchOffsets(clicks, onsets)).toEqual([68, 68])
  })
  it('accetta un onset fino a 5 ms prima del click (jitter)', () => {
    expect(matchOffsets([1], [0.997])).toHaveLength(1)
    expect(matchOffsets([1], [0.99])).toHaveLength(0)
  })
})

describe('median / latencyFromOffsets', () => {
  it('mediana pari e dispari', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('latenza = mediana; null sotto 4 match', () => {
    expect(latencyFromOffsets([68, 68, 69, 200])).toBe(68.5)
    expect(latencyFromOffsets([68, 68, 69])).toBeNull()
  })
})

describe('rampGainsDb', () => {
  it('12 valori equispaziati da −22 a 0', () => {
    const g = rampGainsDb()
    expect(g).toHaveLength(12)
    expect(g[0]).toBe(-22)
    expect(g[11]).toBeCloseTo(0)
    expect(g[1] - g[0]).toBeCloseTo(2)
  })
})

describe('fitRamp', () => {
  it('pendenza 1 e R² 1 su una rampa perfetta traslata', () => {
    const points = rampGainsDb().map((db) => ({ expectedDb: db, measuredDb: db - 7 }))
    const fit = fitRamp(points)!
    expect(fit.slope).toBeCloseTo(1)
    expect(fit.r2).toBeCloseTo(1)
    expect(fit.n).toBe(12)
  })
  it('pendenza 0.5 su una rampa compressa 2:1', () => {
    const points = rampGainsDb().map((db) => ({ expectedDb: db, measuredDb: db * 0.5 - 20 }))
    expect(fitRamp(points)!.slope).toBeCloseTo(0.5)
  })
  it('ignora i punti non rilevati e ritorna null sotto 4 punti', () => {
    const points = rampGainsDb().map((db, i) => ({ expectedDb: db, measuredDb: i < 9 ? null : db }))
    expect(fitRamp(points)).toBeNull()
    const four = rampGainsDb().map((db, i) => ({ expectedDb: db, measuredDb: i < 8 ? null : db }))
    expect(fitRamp(four)!.n).toBe(4)
  })
})

describe('dynamicsVerdict', () => {
  it('soglie 0.85 e 0.5', () => {
    expect(dynamicsVerdict(0.99)).toBe('intatta')
    expect(dynamicsVerdict(0.85)).toBe('intatta')
    expect(dynamicsVerdict(0.7)).toBe('compressa')
    expect(dynamicsVerdict(0.3)).toBe('schiacciata')
  })
})
