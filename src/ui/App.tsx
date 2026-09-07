import { useEffect, useState } from 'react'
import { createEngine, describeMicError, type Engine } from '../audio/engine'
import { loadCalibration, saveCalibration, type CalibrationData } from '../audio/storage'
import type { Exercise } from '../engine/types'
import { CalibrationScreen } from './CalibrationScreen'
import { ExercisePicker } from './ExercisePicker'
import { StartScreen } from './StartScreen'

type Screen = 'start' | 'calibration' | 'pick' | 'session'

export function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [engine, setEngine] = useState<Engine | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calibration, setCalibration] = useState<CalibrationData | null>(() => loadCalibration(localStorage))
  const [pick, setPick] = useState<{ exercise: Exercise; bpm: number } | null>(null)
  const [suspended, setSuspended] = useState(false)

  // iOS sospende il contesto dopo lock/background: mostra il banner e riprendi al tap.
  useEffect(() => {
    if (!engine) return
    const check = () => setSuspended(engine.ctx.state !== 'running')
    engine.ctx.addEventListener('statechange', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      engine.ctx.removeEventListener('statechange', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [engine])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const e = await createEngine()
      setEngine(e)
      setScreen('calibration')
    } catch (err) {
      setError(describeMicError(err))
    } finally {
      setBusy(false)
    }
  }

  function onCalibrated(data: CalibrationData) {
    saveCalibration(localStorage, data)
    setCalibration(data)
    setScreen('pick')
  }

  const banner = suspended && engine && (
    <button onClick={() => engine.ctx.resume().then(() => setSuspended(false))}>Audio in pausa: tocca per riprendere</button>
  )

  if (screen === 'start' || !engine) return <StartScreen onStart={start} busy={busy} error={error} />
  if (screen === 'calibration') return <>{banner}<CalibrationScreen engine={engine} existing={calibration} onDone={onCalibrated} /></>
  if (screen === 'pick' || !pick || !calibration) {
    return <>{banner}<ExercisePicker onPick={(exercise, bpm) => { setPick({ exercise, bpm }); setScreen('session') }} onRecalibrate={() => setScreen('calibration')} /></>
  }
  return <main>{banner}<p>Sessione: {pick.exercise.name} @ {pick.bpm} bpm (Task 12)</p><button onClick={() => setScreen('pick')}>Indietro</button></main>
}
