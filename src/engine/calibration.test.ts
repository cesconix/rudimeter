import { describe, expect, it } from 'bun:test'
import {
  dynamicsVerdict,
  fitRamp,
  latencyFromOffsets,
  matchOffsets,
  matchRampPoints,
  median,
  rampCoherent,
  rampGainsDb,
} from './calibration'

describe('matchOffsets', () => {
  it('matches every click to the first onset within 300 ms and returns the offsets in ms', () => {
    const clicks = [1, 1.5, 2, 2.5]
    const onsets = [1.068, 1.568, 2.9]
    expect(matchOffsets(clicks, onsets)).toEqual([68, 68])
  })
  it('accepts an onset up to 5 ms before the click (jitter)', () => {
    expect(matchOffsets([1], [0.997])).toHaveLength(1)
    expect(matchOffsets([1], [0.99])).toHaveLength(0)
  })
  it('every onset is matched at most once, even with overlapping windows', () => {
    const clicks = [1, 1.01]
    const onsets = [1.005]
    expect(matchOffsets(clicks, onsets)).toEqual([5])
  })
})

describe('matchRampPoints', () => {
  it('matches every click to the first hit within 300 ms and returns RampPoint[]', () => {
    const clicks = [
      { t: 1, db: -22 },
      { t: 1.4, db: -11 },
      { t: 1.8, db: 0 },
    ]
    const hits = [
      { t: 1.068, peakDb: -20 },
      { t: 1.468, peakDb: -9 },
      { t: 2.9, peakDb: 2 },
    ]
    const points = matchRampPoints(clicks, hits)
    expect(points).toEqual([
      { expectedDb: -22, measuredDb: -20 },
      { expectedDb: -11, measuredDb: -9 },
      { expectedDb: 0, measuredDb: null },
    ])
  })
  it('returns measuredDb: null if no hit was detected for the click', () => {
    const clicks = [
      { t: 1, db: -22 },
      { t: 1.4, db: -11 },
      { t: 1.8, db: 0 },
    ]
    const hits = [{ t: 1.068, peakDb: -20 }]
    const points = matchRampPoints(clicks, hits)
    expect(points).toEqual([
      { expectedDb: -22, measuredDb: -20 },
      { expectedDb: -11, measuredDb: null },
      { expectedDb: 0, measuredDb: null },
    ])
  })
  it('does not shift the matching of the later clicks when one has no hit', () => {
    const clicks = [
      { t: 1, db: -22 },
      { t: 1.4, db: -11 },
      { t: 1.8, db: 0 },
    ]
    const hits = [
      { t: 1.068, peakDb: -20 },
      { t: 1.8, peakDb: 2 },
    ]
    const points = matchRampPoints(clicks, hits)
    expect(points).toEqual([
      { expectedDb: -22, measuredDb: -20 },
      { expectedDb: -11, measuredDb: null },
      { expectedDb: 0, measuredDb: 2 },
    ])
  })
  it('every hit is matched at most once, even with overlapping windows', () => {
    const clicks = [
      { t: 1, db: -22 },
      { t: 1.01, db: -11 },
    ]
    const hits = [{ t: 1.005, peakDb: -15 }]
    const points = matchRampPoints(clicks, hits)
    expect(points).toEqual([
      { expectedDb: -22, measuredDb: -15 },
      { expectedDb: -11, measuredDb: null },
    ])
  })
})

describe('median / latencyFromOffsets', () => {
  it('even and odd median', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
  it('latency = median; null below 4 matches', () => {
    expect(latencyFromOffsets([68, 68, 69, 200])).toBe(68.5)
    expect(latencyFromOffsets([68, 68, 69])).toBeNull()
  })
})

describe('rampGainsDb', () => {
  it('12 evenly spaced values from −22 to 0', () => {
    const g = rampGainsDb()
    expect(g).toHaveLength(12)
    expect(g[0]).toBe(-22)
    expect(g[11]).toBeCloseTo(0)
    expect(g[1] - g[0]).toBeCloseTo(2)
  })
})

describe('fitRamp', () => {
  it('slope 1 and R² 1 on a perfect shifted ramp', () => {
    const points = rampGainsDb().map((db) => ({ expectedDb: db, measuredDb: db - 7 }))
    // biome-ignore lint/style/noNonNullAssertion: the fixture feeds fitRamp enough points, so it cannot return null in this test.
    const fit = fitRamp(points)!
    expect(fit.slope).toBeCloseTo(1)
    expect(fit.r2).toBeCloseTo(1)
    expect(fit.n).toBe(12)
  })
  it('slope 0.5 on a 2:1 compressed ramp', () => {
    const points = rampGainsDb().map((db) => ({ expectedDb: db, measuredDb: db * 0.5 - 20 }))
    // biome-ignore lint/style/noNonNullAssertion: the fixture feeds fitRamp enough points, so it cannot return null in this test.
    expect(fitRamp(points)!.slope).toBeCloseTo(0.5)
  })
  it('ignores the undetected points and returns null below 4 points', () => {
    const points = rampGainsDb().map((db, i) => ({ expectedDb: db, measuredDb: i < 9 ? null : db }))
    expect(fitRamp(points)).toBeNull()
    const four = rampGainsDb().map((db, i) => ({ expectedDb: db, measuredDb: i < 8 ? null : db }))
    // biome-ignore lint/style/noNonNullAssertion: the fixture feeds fitRamp enough points, so it cannot return null in this test.
    expect(fitRamp(four)!.n).toBe(4)
  })
})

describe('dynamicsVerdict', () => {
  it('thresholds 0.85 and 0.5 on a coherent ramp', () => {
    expect(dynamicsVerdict({ slope: 0.99, r2: 1 })).toBe('intact')
    expect(dynamicsVerdict({ slope: 0.85, r2: 0.95 })).toBe('intact')
    expect(dynamicsVerdict({ slope: 0.7, r2: 0.9 })).toBe('compressed')
    expect(dynamicsVerdict({ slope: 0.3, r2: 0.9 })).toBe('crushed')
  })

  it('inconclusive when the line does not explain the points or slopes down', () => {
    // iPhone, Safari, 2026-09-10: the microphone's own processing scattered the levels.
    expect(dynamicsVerdict({ slope: 0.64, r2: 0.147 })).toBe('inconclusive')
    // Mac, first calibration after opening the microphone (spike, 2026-09-06).
    expect(dynamicsVerdict({ slope: -0.44, r2: 0.99 })).toBe('inconclusive')
    expect(dynamicsVerdict({ slope: 0, r2: 1 })).toBe('inconclusive')
  })
})

describe('rampCoherent', () => {
  it('needs a rising line with r² of at least 0.9', () => {
    expect(rampCoherent({ slope: 1, r2: 0.9 })).toBe(true)
    expect(rampCoherent({ slope: 1, r2: 0.89 })).toBe(false)
    expect(rampCoherent({ slope: 0, r2: 1 })).toBe(false)
  })
})
