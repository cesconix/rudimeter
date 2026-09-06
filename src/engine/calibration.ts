export interface RampPoint {
  expectedDb: number
  measuredDb: number | null
}

export interface RampFit {
  slope: number
  r2: number
  n: number
}

/** Per ogni click, il primo onset in [click − 5 ms, click + maxMs). Ritorna gli offset in ms. */
export function matchOffsets(clickTimes: number[], onsetTimes: number[], maxMs = 300): number[] {
  const out: number[] = []
  for (const c of clickTimes) {
    const o = onsetTimes.find((t) => t >= c - 0.005 && t < c + maxMs / 1000)
    if (o !== undefined) out.push(Math.round((o - c) * 1e6) / 1000)
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

/** Regressione lineare dB misurati vs attesi. null sotto minPoints rilevati. */
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

export type DynamicsVerdict = 'intatta' | 'compressa' | 'schiacciata'

export function dynamicsVerdict(slope: number): DynamicsVerdict {
  if (slope >= 0.85) return 'intatta'
  if (slope >= 0.5) return 'compressa'
  return 'schiacciata'
}
