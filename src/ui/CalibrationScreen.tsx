import { useState } from 'react'
import { runLatencyCalibration, runRampCalibration } from '../audio/calibration'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import type { Engine } from '../audio/engine'
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
          `The microphone heard ${lat.offsetsMs.length} clicks out of 8. Almost always this means headphones are connected: with headphones on, the speaker is silent. Take them off, turn the volume up and try again.`,
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
          ? `Ramp: only ${n}/12 clicks detected, dynamics not calibrated.`
          : `Ramp: ${n}/12 clicks, slope ${s.toFixed(2)}, r² ${(ramp.fit?.r2 ?? 0).toFixed(3)} → dynamics ${dynamicsVerdict(s)}.`,
      )
      setStep('done')
    } catch (err) {
      const msg = (err as { message?: string })?.message
      setStep('failed')
      setDetail(msg ? `Error during calibration: ${msg}. Try again.` : 'Error during calibration. Try again.')
    }
  }

  function finish() {
    if (latencyMs === null) return
    onDone({ latencyMs, slope, deviceLabel: engine.capture.info?.deviceLabel ?? '', savedAt: new Date().toISOString() })
  }

  const running =
    step === 'latency'
      ? 'Measuring latency: 8 clicks. Do not touch anything.'
      : step === 'ramp'
        ? 'Measuring dynamics: 12 clicks from soft to loud. Do not touch anything.'
        : step === 'done'
          ? 'Done. Now put your headphones on and press Continue.'
          : ''

  // A negative slope, or a line that does not explain the points, is not "little dynamics":
  // it is the symptom of a measurement worth nothing, one that has to be repeated.
  const incoherent = slope !== null && (slope <= 0 || (r2 !== null && r2 < 0.9))

  const info = engine.capture.info
  const mic = info
    ? `Microphone: ${info.deviceLabel || 'unnamed'} · ${
        info.supported.autoGainControl === true
          ? info.settings.autoGainControl === true
            ? 'auto gain control ON: it can alter the dynamics'
            : 'auto gain control off'
          : 'auto gain control not governable from this browser (the constraint is ignored)'
      }`
    : ''

  return (
    <main>
      <h1>Calibration</h1>
      {step === 'idle' || step === 'failed' ? (
        <>
          <p>
            <b>Take your headphones off</b> and turn the volume up: the microphone must hear the clicks from the
            speaker. Put the device down in front of you, still and silent.
          </p>
          <p>
            <b>You must not play.</b> Press Calibrate and wait ~10 seconds without touching anything: the app plays
            clicks to itself and listens back to them on its own to measure how late the microphone is.
          </p>
        </>
      ) : (
        <p className="big">{running}</p>
      )}
      {existing && step === 'idle' && (
        <p>
          Saved calibration: latency {existing.latencyMs.toFixed(1)} ms
          {existing.slope !== null ? `, slope ${existing.slope.toFixed(2)}` : ''} ({existing.deviceLabel}).
        </p>
      )}
      <div className="row">
        <button type="button" onClick={run} disabled={step === 'latency' || step === 'ramp'}>
          {step === 'latency' ? 'Latency…' : step === 'ramp' ? 'Ramp…' : existing ? 'Recalibrate' : 'Calibrate'}
        </button>
        {existing && (step === 'idle' || step === 'failed') && (
          <button type="button" className="secondary" onClick={() => onDone(existing)}>
            Use the saved one
          </button>
        )}
        {step === 'done' && (
          <button type="button" onClick={finish}>
            Continue
          </button>
        )}
      </div>
      {latencyMs !== null && <p className="big">Latency {latencyMs.toFixed(1)} ms</p>}
      {incoherent ? (
        <p className="error">
          {/* biome-ignore lint/style/noNonNullAssertion: incoherent is only true when slope is not null, which TypeScript cannot narrow from a boolean. */}
          Inconsistent measurement: the detected level does not rise with the click volume (slope {slope!.toFixed(2)},
          r² {(r2 ?? 0).toFixed(2)}). This is not compressed dynamics, it is a measurement to throw away. Check that no
          headphones are connected and <b>redo the calibration</b>.
        </p>
      ) : (
        slope !== null &&
        slope < 0.5 && (
          <p className="error">
            Dynamics unreliable on this device (slope {slope.toFixed(2)}). The timing is still valid.
          </p>
        )
      )}
      {detail && <p className={step === 'failed' ? 'error' : ''}>{detail}</p>}
      {mic && (
        <p>
          <small>{mic}</small>
        </p>
      )}
    </main>
  )
}
