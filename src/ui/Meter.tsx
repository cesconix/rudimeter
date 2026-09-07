import { useEffect, useState } from 'react'
import type { Engine } from '../audio/engine'

export function Meter({ engine }: { engine: Engine }) {
  const [peak, setPeak] = useState(-120)
  useEffect(() => engine.capture.onMeter((m) => setPeak(m.peakDb)), [engine])
  const pct = Math.max(0, Math.min(100, ((peak + 60) / 60) * 100))
  return (
    <div>
      <div className="meter"><div style={{ width: `${pct}%` }} /></div>
      <small>mic {peak.toFixed(0)} dBFS</small>
    </div>
  )
}
