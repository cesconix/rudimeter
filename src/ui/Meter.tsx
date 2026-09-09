import { useEffect, useState } from 'react'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import { audibleTime } from '../audio/clock'
import type { Engine } from '../audio/engine'

/** From dBFS to a percentage of the bar: the scale covers -60 to 0. */
const toPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

/**
 * Microphone level with the detection threshold drawn on top.
 * It is there to place the device: below the mark the hit is not counted.
 */
export function Meter({ engine, floorDb = DEFAULT_THRESHOLDS.floorDb }: { engine: Engine; floorDb?: number }) {
  const [peak, setPeak] = useState(-120)
  // LIVE output latency: how long a scheduled sample takes to reach the ear. It is the difference
  // between the scheduling clock and the audible one (see `audibleTime`), and it changes when the
  // audio path changes — Bluetooth headphones add a hundred ms or so. The calibration, instead,
  // freezes a single number and reuses it forever: if the two diverge, the hits are judged with the
  // correction of a path you are not using. It is on screen because it is the only way, on an iPad,
  // to see this divergence while it happens.
  const [outMs, setOutMs] = useState<number | null>(null)
  useEffect(() => engine.capture.onMeter((m) => setPeak(m.peakDb)), [engine])
  useEffect(() => {
    const id = window.setInterval(() => setOutMs((engine.ctx.currentTime - audibleTime(engine.ctx)) * 1000), 250)
    return () => clearInterval(id)
  }, [engine])
  const audible = peak >= floorDb
  return (
    <div>
      <div className="meter">
        <div style={{ width: `${toPct(peak)}%` }} />
        <i className="threshold" style={{ left: `${toPct(floorDb)}%` }} />
      </div>
      <small>
        mic {peak.toFixed(0)} dBFS · threshold {floorDb} {audible ? '· above threshold' : '· below threshold'}
        {outMs !== null ? ` · output ${outMs.toFixed(0)} ms` : ''}
      </small>
    </div>
  )
}
