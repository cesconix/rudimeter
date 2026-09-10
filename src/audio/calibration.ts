import {
  fitRamp,
  latencyFromOffsets,
  matchOffsets,
  matchRampPoints,
  type RampFit,
  type RampPoint,
  rampGainsDb,
} from '../engine/calibration'
import type { Hit } from '../engine/types'
import type { Capture, Thresholds } from './capture'
import { scheduleClick } from './click'
import type { Engine } from './engine'

type AudioPath = Pick<Engine, 'ctx' | 'capture' | 'out'>

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function collectHits(ctx: AudioContext, capture: Capture, untilAudioTime: number): Promise<Hit[]> {
  const hits: Hit[] = []
  const off = capture.onHit((h) => hits.push(h))
  await wait(Math.max(0, (untilAudioTime - ctx.currentTime) * 1000))
  off()
  return hits
}

/** 8 clicks from the speaker; latency = median (onset − click). null if fewer than 4 detected. */
export async function runLatencyCalibration(
  engine: AudioPath,
  n = 8,
  spacing = 0.5,
): Promise<{ latencyMs: number | null; offsetsMs: number[] }> {
  const { ctx, capture, out } = engine
  const t0 = ctx.currentTime + 0.3
  const clicks = Array.from({ length: n }, (_, i) => t0 + i * spacing)
  clicks.forEach((t) => {
    scheduleClick(out, t, { gain: 0.8, dur: 0.01 })
  })
  const hits = await collectHits(ctx, capture, t0 + n * spacing + 0.4)
  const offsetsMs = matchOffsets(
    clicks,
    hits.map((h) => h.t),
  )
  return { latencyMs: latencyFromOffsets(offsetsMs), offsetsMs }
}

/** Ramp of 12 clicks from −22 to 0 dB with the threshold lowered to −58 during the test. */
export async function runRampCalibration(
  engine: AudioPath,
  thresholds: Thresholds,
): Promise<{ fit: RampFit | null; points: RampPoint[] }> {
  const { ctx, capture, out } = engine
  capture.setThresholds({ floorDb: -58, ratio: thresholds.ratio })
  try {
    const t0 = ctx.currentTime + 0.3
    const clicks = rampGainsDb().map((db, i) => ({ t: t0 + i * 0.4, db }))
    clicks.forEach((c) => {
      scheduleClick(out, c.t, { gain: 10 ** (c.db / 20), dur: 0.01 })
    })
    const hits = await collectHits(ctx, capture, t0 + clicks.length * 0.4 + 0.3)
    const points = matchRampPoints(clicks, hits)
    return { fit: fitRamp(points), points }
  } finally {
    capture.setThresholds(thresholds)
  }
}
