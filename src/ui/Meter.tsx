import { useEffect, useState } from 'react'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import { audibleTime } from '../audio/clock'
import type { Engine } from '../audio/engine'

/** Da dBFS a percentuale della barra: la scala copre da -60 a 0. */
const toPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

/**
 * Livello del microfono con la soglia di rilevamento disegnata sopra.
 * Serve a posizionare il device: sotto la tacca il colpo non viene contato.
 */
export function Meter({ engine, floorDb = DEFAULT_THRESHOLDS.floorDb }: { engine: Engine; floorDb?: number }) {
  const [peak, setPeak] = useState(-120)
  // Latenza di uscita DAL VIVO: quanto ci mette un campione schedulato ad arrivare all'orecchio.
  // È la differenza fra il clock di schedulazione e quello udibile (vedi `audibleTime`), e cambia
  // quando cambia il percorso audio — le cuffie Bluetooth ne aggiungono un centinaio di ms. La
  // calibrazione invece congela un numero solo e lo riusa per sempre: se i due divergono, i colpi
  // vengono giudicati con la correzione di un percorso che non stai usando. Sta a schermo perché è
  // l'unico modo, su un iPad, di vedere questa divergenza mentre succede.
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
        mic {peak.toFixed(0)} dBFS · soglia {floorDb} {audible ? '· sopra soglia' : '· sotto soglia'}
        {outMs !== null ? ` · uscita ${outMs.toFixed(0)} ms` : ''}
      </small>
    </div>
  )
}
