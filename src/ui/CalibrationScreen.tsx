import { useEffect, useRef, useState } from 'react'
import { runLatencyCalibration, runRampCalibration } from '../audio/calibration'
import { DEFAULT_THRESHOLDS } from '../audio/capture'
import type { Engine } from '../audio/engine'
import type { CalibrationData } from '../audio/storage'
import { dynamicsVerdict, type RampFit, type RampPoint, rampCoherent } from '../engine/calibration'
import type { SynthRun } from '../sim/graph'

export interface CalibrationMeasure {
  latencyMs: number | null
  offsetsMs: number[]
  points?: RampPoint[]
  fit?: RampFit | null
}

interface Props {
  engine: Engine
  synth: SynthRun | null
  existing: CalibrationData | null
  onDone(data: CalibrationData): void
  /** Bumped by the remote `calibrate` command: runs the calibration as if Calibrate had been pressed. */
  runSignal?: number
  /** Every measurement, good or bad, for the remote log. */
  onMeasured?(m: CalibrationMeasure): void
}

type Step = 'idle' | 'latency' | 'ramp' | 'done' | 'failed'

export function CalibrationScreen({ engine, synth, existing, onDone, runSignal, onMeasured }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [fit, setFit] = useState<RampFit | null>(null)
  const [detail, setDetail] = useState('')

  // Returns what `finish()` would save, or null when there is nothing to save: the remote signal
  // below needs the data right away, because it continues on its own instead of waiting for Continue.
  async function run(): Promise<CalibrationData | null> {
    setStep('latency')
    setFit(null)
    setDetail('')
    try {
      const lat = await runLatencyCalibration(engine)
      if (lat.latencyMs === null) {
        setStep('failed')
        setDetail(
          `The microphone heard ${lat.offsetsMs.length} clicks out of 8. Almost always this means headphones are connected: with headphones on, the speaker is silent. Take them off, turn the volume up and try again.`,
        )
        onMeasured?.({ latencyMs: null, offsetsMs: lat.offsetsMs })
        return null
      }
      setLatencyMs(lat.latencyMs)
      setStep('ramp')
      const ramp = await runRampCalibration(engine, DEFAULT_THRESHOLDS)
      const f = ramp.fit ?? null
      setFit(f)
      const n = ramp.points.filter((p) => p.measuredDb !== null).length
      setDetail(
        f === null
          ? `Ramp: only ${n}/12 clicks detected, dynamics not calibrated.`
          : `Ramp: ${n}/12 clicks, slope ${f.slope.toFixed(2)}, r² ${f.r2.toFixed(3)} → dynamics ${dynamicsVerdict(f)}.`,
      )
      setStep('done')
      onMeasured?.({ latencyMs: lat.latencyMs, offsetsMs: lat.offsetsMs, points: ramp.points, fit: f })
      // The same rule as `finish()`: a ramp that does not hold together saves no slope.
      return {
        latencyMs: lat.latencyMs,
        slope: f !== null && rampCoherent(f) ? f.slope : null,
        deviceLabel: engine.capture.info?.deviceLabel ?? '',
        savedAt: new Date().toISOString(),
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message
      setStep('failed')
      setDetail(msg ? `Error during calibration: ${msg}. Try again.` : 'Error during calibration. Try again.')
      return null
    }
  }

  // The remote command arrives outside React's event flow: the latest `run` and `onDone` are read through
  // refs, so the effect depends on the signal alone and never re-runs a calibration because a render
  // changed a closure. The operator asked for a calibration, not for a screen to look at: on success it
  // continues by itself, exactly what Continue would do.
  const runRef = useRef(run)
  runRef.current = run
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // The signal already served. StrictMode runs a mount effect twice in dev, and dev is the only place
  // the remote channel exists: when `calibrate` arrives while another screen is up, this one mounts
  // with the signal already bumped and both passes fire. Measured: two overlapping runs, 16 clicks on
  // the same 8 instants, so the microphone hears them at double level and the ramp slope is measured
  // on a signal nobody played.
  const ranSignal = useRef(0)
  useEffect(() => {
    if (!runSignal || ranSignal.current === runSignal) return
    ranSignal.current = runSignal
    runRef.current().then((data) => {
      if (data) onDoneRef.current(data)
    })
  }, [runSignal])

  // A ramp that does not hold together leaves the timing alone: the latency comes from 8 clicks at one
  // level, so the session can still run, only without the dynamics correction.
  const badRamp = fit !== null && !rampCoherent(fit) ? fit : null

  function finish() {
    if (latencyMs === null) return
    // A bad ramp saves no slope: dynamics unknown, not corrected by a number that means nothing.
    const slope = badRamp ? null : (fit?.slope ?? null)
    onDone({ latencyMs, slope, deviceLabel: engine.capture.info?.deviceLabel ?? '', savedAt: new Date().toISOString() })
  }

  const running =
    step === 'latency'
      ? 'Measuring latency: 8 clicks. Do not touch anything.'
      : step === 'ramp'
        ? 'Measuring dynamics: 12 clicks from soft to loud. Do not touch anything.'
        : step === 'done'
          ? badRamp
            ? 'Timing measured. The dynamics ramp is unusable: redo it, or put your headphones on and continue with timing only.'
            : 'Done. Now put your headphones on and press Continue.'
          : ''

  const info = engine.capture.info
  const mic = synth
    ? `Synthetic input: the speaker path is a ${synth.config.latencyMs} ms delay, no microphone is open.`
    : info
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
      {badRamp ? (
        <p className="error">
          Inconsistent measurement: the detected level does not rise with the click volume (slope{' '}
          {badRamp.slope.toFixed(2)}, r² {badRamp.r2.toFixed(2)}). This is not compressed dynamics, it is a measurement
          to throw away: the timing is kept, the dynamics will not be corrected. Check that no headphones are connected
          (on iOS the microphone's own processing can do this too) and <b>redo the calibration</b>, or continue with
          timing only.
        </p>
      ) : (
        fit !== null &&
        fit.slope < 0.5 && (
          <p className="error">
            Dynamics unreliable on this device (slope {fit.slope.toFixed(2)}). The timing is still valid.
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
