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
  const [r2, setR2] = useState<number | null>(null)
  const [detail, setDetail] = useState('')

  async function run() {
    setStep('latency')
    setSlope(null)
    setR2(null)
    setDetail('')
    try {
      const lat = await runLatencyCalibration(engine.ctx, engine.capture)
      if (lat.latencyMs === null) {
        setStep('failed')
        setDetail(
          `Il microfono ha sentito ${lat.offsetsMs.length} click su 8. Quasi sempre è perché le cuffie sono collegate: con le cuffie lo speaker è muto. Toglile, alza il volume e riprova.`,
        )
        return
      }
      setLatencyMs(lat.latencyMs)
      setStep('ramp')
      const ramp = await runRampCalibration(engine.ctx, engine.capture, DEFAULT_THRESHOLDS)
      const s = ramp.fit?.slope ?? null
      setSlope(s)
      setR2(ramp.fit?.r2 ?? null)
      const n = ramp.points.filter((p) => p.measuredDb !== null).length
      setDetail(
        s === null
          ? `Rampa: solo ${n}/12 click rilevati, dinamica non calibrata.`
          : `Rampa: ${n}/12 click, pendenza ${s.toFixed(2)}, r² ${(ramp.fit?.r2 ?? 0).toFixed(3)} → dinamica ${dynamicsVerdict(s)}.`,
      )
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

  const running =
    step === 'latency'
      ? 'Misuro la latenza: 8 click. Non toccare niente.'
      : step === 'ramp'
        ? 'Misuro la dinamica: 12 click dal piano al forte. Non toccare niente.'
        : step === 'done'
          ? 'Fatto. Ora metti le cuffie e premi Continua.'
          : ''

  // Una pendenza negativa o una retta che non spiega i punti non sono "poca dinamica":
  // sono il sintomo che la misura non vale niente e va ripetuta.
  const incoherent = slope !== null && (slope <= 0 || (r2 !== null && r2 < 0.9))

  const info = engine.capture.info
  const mic = info
    ? `Microfono: ${info.deviceLabel || 'senza nome'} · ${
        info.supported.autoGainControl === true
          ? info.settings.autoGainControl === true
            ? 'guadagno automatico ATTIVO: può alterare la dinamica'
            : 'guadagno automatico disattivato'
          : 'guadagno automatico non governabile da questo browser (il vincolo viene ignorato)'
      }`
    : ''

  return (
    <main>
      <h1>Calibrazione</h1>
      {step === 'idle' || step === 'failed' ? (
        <>
          <p><b>Togli le cuffie</b> e alza il volume: il microfono deve sentire i click dallo speaker. Appoggia il device fermo davanti a te, in silenzio.</p>
          <p><b>Tu non devi suonare.</b> Premi Calibra e aspetta ~10 secondi senza toccare niente: l'app si suona dei click e li riascolta da sola per misurare quanto tarda il microfono.</p>
        </>
      ) : (
        <p className="big">{running}</p>
      )}
      {existing && step === 'idle' && (
        <p>Calibrazione salvata: latenza {existing.latencyMs.toFixed(1)} ms{existing.slope !== null ? `, pendenza ${existing.slope.toFixed(2)}` : ''} ({existing.deviceLabel}).</p>
      )}
      <div className="row">
        <button type="button" onClick={run} disabled={step === 'latency' || step === 'ramp'}>
          {step === 'latency' ? 'Latenza…' : step === 'ramp' ? 'Rampa…' : existing ? 'Ricalibra' : 'Calibra'}
        </button>
        {existing && (step === 'idle' || step === 'failed') && <button type="button" className="secondary" onClick={() => onDone(existing)}>Usa quella salvata</button>}
        {step === 'done' && <button type="button" onClick={finish}>Continua</button>}
      </div>
      {latencyMs !== null && <p className="big">Latenza {latencyMs.toFixed(1)} ms</p>}
      {incoherent ? (
        <p className="error">
          {/* biome-ignore lint/style/noNonNullAssertion: incoherent is only true when slope is not null, which TypeScript cannot narrow from a boolean. */}
          Misura incoerente: il livello rilevato non sale col volume del click (pendenza {slope!.toFixed(2)}, r² {(r2 ?? 0).toFixed(2)}).
          Non è una dinamica compressa, è una misura da buttare. Controlla che non ci siano cuffie collegate e <b>rifai la calibrazione</b>.
        </p>
      ) : (
        slope !== null && slope < 0.5 && <p className="error">Dinamica poco affidabile su questo dispositivo (pendenza {slope.toFixed(2)}). Il timing resta valido.</p>
      )}
      {detail && <p className={step === 'failed' ? 'error' : ''}>{detail}</p>}
      {mic && <p><small>{mic}</small></p>}
    </main>
  )
}
