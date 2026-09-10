export interface RampPoint {
  expectedDb: number
  measuredDb: number | null
}

export interface RampFit {
  slope: number
  r2: number
  n: number
}

/** For every click, the first onset in [click − 5 ms, click + maxMs). Returns the offsets in ms. */
export function matchOffsets(clickTimes: number[], onsetTimes: number[], maxMs = 300): number[] {
  const out: number[] = []
  let cursor = 0
  const maxSec = maxMs / 1000

  for (const c of clickTimes) {
    // Advance cursor past onsets too early for this click
    while (cursor < onsetTimes.length && onsetTimes[cursor] < c - 0.005) {
      cursor++
    }

    // Check if current onset is in range [c - 0.005, c + maxSec)
    if (cursor < onsetTimes.length && onsetTimes[cursor] < c + maxSec) {
      out.push(Math.round((onsetTimes[cursor] - c) * 1e6) / 1000)
      cursor++
    }
  }

  return out
}

/** For every ramp click, the first hit in [click − 5 ms, click + maxMs). Returns RampPoint[] with expectedDb and measuredDb. */
export function matchRampPoints(
  clicks: { t: number; db: number }[],
  hits: { t: number; peakDb: number }[],
  maxMs = 300,
): RampPoint[] {
  const out: RampPoint[] = []
  let cursor = 0
  const maxSec = maxMs / 1000

  for (const c of clicks) {
    // Advance cursor past hits too early for this click
    while (cursor < hits.length && hits[cursor].t < c.t - 0.005) {
      cursor++
    }

    // Check if current hit is in range [c.t - 0.005, c.t + maxSec)
    if (cursor < hits.length && hits[cursor].t < c.t + maxSec) {
      out.push({ expectedDb: c.db, measuredDb: hits[cursor].peakDb })
      cursor++
    } else {
      out.push({ expectedDb: c.db, measuredDb: null })
    }
  }

  return out
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const h = s.length >> 1
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

export function latencyFromOffsets(offsetsMs: number[], minMatches = 4): number | null {
  return offsetsMs.length >= minMatches ? median(offsetsMs) : null
}

export function rampGainsDb(n = 12, fromDb = -22, toDb = 0): number[] {
  return Array.from({ length: n }, (_, i) => fromDb + ((toDb - fromDb) * i) / (n - 1))
}

/** Linear regression of measured vs expected dB. null below minPoints detected. */
export function fitRamp(points: RampPoint[], minPoints = 4): RampFit | null {
  const ok = points.filter((p): p is { expectedDb: number; measuredDb: number } => p.measuredDb !== null)
  if (ok.length < minPoints) return null
  const mx = ok.reduce((a, p) => a + p.expectedDb, 0) / ok.length
  const my = ok.reduce((a, p) => a + p.measuredDb, 0) / ok.length
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of ok) {
    sxy += (p.expectedDb - mx) * (p.measuredDb - my)
    sxx += (p.expectedDb - mx) ** 2
    syy += (p.measuredDb - my) ** 2
  }
  return { slope: sxy / sxx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1, n: ok.length }
}

export type DynamicsVerdict = 'intact' | 'compressed' | 'crushed' | 'inconclusive'

/**
 * A line that slopes down, or one that does not explain the points (r² < 0.9), is not "little dynamics":
 * it is a measurement worth nothing, one to repeat. Seen on an iPhone whose own microphone processing
 * scattered the levels: slope 0.64, r² 0.15.
 */
export function rampCoherent(fit: Pick<RampFit, 'slope' | 'r2'>): boolean {
  return fit.slope > 0 && fit.r2 >= 0.9
}

export function dynamicsVerdict(fit: Pick<RampFit, 'slope' | 'r2'>): DynamicsVerdict {
  if (!rampCoherent(fit)) return 'inconclusive'
  if (fit.slope >= 0.85) return 'intact'
  if (fit.slope >= 0.5) return 'compressed'
  return 'crushed'
}
