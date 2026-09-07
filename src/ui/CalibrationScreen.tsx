import { useState } from 'react'
import type { Engine } from '../audio/engine'
import { runLatencyCalibration, runRampCalibration } from '../audio/calibration'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import type { CalibrationData } from '../audio/storage'
import { dynamicsVerdict } from '../engine/calibration'

interface Props {
  engine: Engine
  existing: CalibrationData | null
  onDone(data: CalibrationData): void
}

type Step = 'idle' | 'latency' | 'ramp' | 'done' | 'failed'

export function CalibrationScreen({ engine, existing, onDone }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [slope, setSlope] = useState<number | null>(null)
  const [detail, setDetail] = useState('')

  async function run() {
    setStep('latency')
    try {
      const lat = await runLatencyCalibration(engine.ctx, engine.capture)
      if (lat.latencyMs === null) {
        setStep('failed')
        setDetail(`Rilevati ${lat.offsetsMs.length} click su 8. Alza il volume, togli le cuffie, riprova.`)
        return
      }
      setLatencyMs(lat.latencyMs)
      setStep('ramp')
      const ramp = await runRampCalibration(engine.ctx, engine.capture, DEFAULT_THRESHOLDS)
      const s = ramp.fit?.slope ?? null
      setSlope(s)
      const n = ramp.points.filter((p) => p.measuredDb !== null).length
      setDetail(s === null ? `Rampa: solo ${n}/12 click rilevati, dinamica non calibrata.` : `Rampa: ${n}/12 click, pendenza ${s.toFixed(2)} → dinamica ${dynamicsVerdict(s)}.`)
      setStep('done')
    } catch (err) {
      const msg = (err as { message?: string })?.message
      setStep('failed')
      setDetail(msg ? `Errore durante la calibrazione: ${msg}. Riprova.` : 'Errore durante la calibrazione. Riprova.')
    }
  }

  function finish() {
    if (latencyMs === null) return
    onDone({ latencyMs, slope, deviceLabel: engine.capture.info?.deviceLabel ?? '', savedAt: new Date().toISOString() })
  }

  return (
    <main>
      <h1>Calibrazione</h1>
      <p>Senza cuffie, volume al massimo, iPad fermo. Circa 10 secondi: 8 click per la latenza, poi 12 click di volume crescente per la dinamica.</p>
      {existing && step === 'idle' && (
        <p>Calibrazione salvata: latenza {existing.latencyMs.toFixed(1)} ms{existing.slope !== null ? `, pendenza ${existing.slope.toFixed(2)}` : ''} ({existing.deviceLabel}).</p>
      )}
      <div className="row">
        <button onClick={run} disabled={step === 'latency' || step === 'ramp'}>
          {step === 'latency' ? 'Latenza…' : step === 'ramp' ? 'Rampa…' : existing ? 'Ricalibra' : 'Calibra'}
        </button>
        {existing && (step === 'idle' || step === 'failed') && <button className="secondary" onClick={() => onDone(existing)}>Usa quella salvata</button>}
        {step === 'done' && <button onClick={finish}>Continua</button>}
      </div>
      {latencyMs !== null && <p className="big">Latenza {latencyMs.toFixed(1)} ms</p>}
      {slope !== null && slope < 0.5 && <p className="error">Dinamica poco affidabile su questo dispositivo (pendenza {slope.toFixed(2)}). Il timing resta valido.</p>}
      {detail && <p className={step === 'failed' ? 'error' : ''}>{detail}</p>}
    </main>
  )
}
