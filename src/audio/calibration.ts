import { fitRamp, latencyFromOffsets, matchOffsets, rampGainsDb, type RampFit, type RampPoint } from '../engine/calibration'
import type { Hit } from '../engine/types'
import { scheduleClick } from './click'
import type { Capture, Thresholds } from './capture'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function collectHits(ctx: AudioContext, capture: Capture, untilAudioTime: number): Promise<Hit[]> {
  const hits: Hit[] = []
  const off = capture.onHit((h) => hits.push(h))
  await wait(Math.max(0, (untilAudioTime - ctx.currentTime) * 1000))
  off()
  return hits
}

/** 8 click dallo speaker; latenza = mediana (onset − click). null se meno di 4 rilevati. */
export async function runLatencyCalibration(ctx: AudioContext, capture: Capture, n = 8, spacing = 0.5): Promise<{ latencyMs: number | null; offsetsMs: number[] }> {
  const t0 = ctx.currentTime + 0.3
  const clicks = Array.from({ length: n }, (_, i) => t0 + i * spacing)
  clicks.forEach((t) => scheduleClick(ctx, t, { gain: 0.8, dur: 0.01 }))
  const hits = await collectHits(ctx, capture, t0 + n * spacing + 0.4)
  const offsetsMs = matchOffsets(clicks, hits.map((h) => h.t))
  return { latencyMs: latencyFromOffsets(offsetsMs), offsetsMs }
}

/** Rampa di 12 click da −22 a 0 dB con soglia abbassata a −58 durante il test. */
export async function runRampCalibration(ctx: AudioContext, capture: Capture, thresholds: Thresholds): Promise<{ fit: RampFit | null; points: RampPoint[] }> {
  capture.setThresholds({ floorDb: -58, ratio: thresholds.ratio })
  try {
    const t0 = ctx.currentTime + 0.3
    const clicks = rampGainsDb().map((db, i) => ({ t: t0 + i * 0.4, db }))
    clicks.forEach((c) => scheduleClick(ctx, c.t, { gain: Math.pow(10, c.db / 20), dur: 0.01 }))
    const hits = await collectHits(ctx, capture, t0 + clicks.length * 0.4 + 0.3)
    const points: RampPoint[] = clicks.map((c) => {
      const o = hits.find((h) => h.t >= c.t - 0.005 && h.t < c.t + 0.3)
      return { expectedDb: c.db, measuredDb: o ? o.peakDb : null }
    })
    return { fit: fitRamp(points), points }
  } finally {
    capture.setThresholds(thresholds)
  }
}
