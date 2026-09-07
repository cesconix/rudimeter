import { useEffect, useState } from 'react'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import type { Engine } from '../audio/engine'

/** Da dBFS a percentuale della barra: la scala copre da -60 a 0. */
const toPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

/**
 * Livello del microfono con la soglia di rilevamento disegnata sopra.
 * Serve a posizionare il device: sotto la tacca il colpo non viene contato.
 */
export function Meter({ engine, floorDb = DEFAULT_THRESHOLDS.floorDb }: { engine: Engine; floorDb?: number }) {
  const [peak, setPeak] = useState(-120)
  useEffect(() => engine.capture.onMeter((m) => setPeak(m.peakDb)), [engine])
  const audible = peak >= floorDb
  return (
    <div>
      <div className="meter">
        <div style={{ width: `${toPct(peak)}%` }} />
        <i className="threshold" style={{ left: `${toPct(floorDb)}%` }} />
      </div>
      <small>mic {peak.toFixed(0)} dBFS · soglia {floorDb} {audible ? '· sopra soglia' : '· sotto soglia'}</small>
    </div>
  )
}
