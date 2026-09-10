import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'
import { createEngine, describeMicError, type Engine } from '../audio/engine'
import {
  type CalibrationData,
  type KeyValueStore,
  loadCalibration,
  memoryStore,
  saveCalibration,
} from '../audio/storage'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'
import { parseSynthConfig } from '../sim/config'
import { createSynthGraph, type SynthGraph, type SynthRun } from '../sim/graph'
import { CalibrationScreen } from './CalibrationScreen'
import { ExercisePicker } from './ExercisePicker'
import { DEFAULT_SESSION_OPTIONS, type SessionOptions } from './options'
import { SessionScreen } from './SessionScreen'
import { StartScreen } from './StartScreen'
import { SummaryScreen } from './SummaryScreen'

type Screen = 'start' | 'calibration' | 'pick' | 'session' | 'summary'

const DEFAULT_BPM = 60

export function App() {
  // `?synth=42[&player=…][&headphones=off]`: a virtual drummer instead of the microphone (see src/sim).
  // Read once: the URL does not change while the app runs.
  const synth = useMemo(() => parseSynthConfig(window.location.search), [])
  // A synthetic run must never leave its fake latency where the real one lives.
  const store = useMemo<KeyValueStore>(() => (synth ? memoryStore() : localStorage), [synth])
  const [screen, setScreen] = useState<Screen>('start')
  const [engine, setEngine] = useState<Engine | null>(null)
  const [synthRun, setSynthRun] = useState<SynthRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calibration, setCalibration] = useState<CalibrationData | null>(() => loadCalibration(store))
  const [pick, setPick] = useState<{ exercise: Exercise; bpm: number; options: SessionOptions } | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [suspended, setSuspended] = useState(false)

  // iOS suspends the context after lock/background: show the banner and resume on tap.
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
      // The graph needs the context and the bus, which only exist inside createEngine: it is built in
      // the callback and kept here for the screens that steer it (headphones, drummer).
      const built: { graph: SynthGraph | null } = { graph: null }
      const e = await createEngine(
        synth
          ? {
              silent: true,
              input: (ctx, out) => {
                built.graph = createSynthGraph(ctx, out, synth)
                return { node: built.graph.input, label: `synthetic input (seed ${synth.seed}, ${synth.preset})` }
              },
            }
          : {},
      )
      setEngine(e)
      setSynthRun(synth && built.graph ? { config: synth, graph: built.graph } : null)
      setScreen(calibration ? 'pick' : 'calibration')
    } catch (err) {
      setError(describeMicError(err))
    } finally {
      setBusy(false)
    }
  }

  function onCalibrated(data: CalibrationData) {
    // In private Safari setItem throws: the calibration stays valid for this session,
    // it will be redone on the next start. Losing the save must not bring the page down.
    try {
      saveCalibration(store, data)
    } catch {
      // Ignore: storing it is an optimization, not a requirement.
    }
    setCalibration(data)
    setScreen('pick')
  }

  const onSessionDone = useCallback((s: SessionStats) => {
    setStats(s)
    setScreen('summary')
  }, [])

  const banner = suspended && engine && (
    <button type="button" onClick={() => engine.ctx.resume().then(() => setSuspended(false))}>
      Audio paused: tap to resume
    </button>
  )

  // Always on screen: a synthetic report must never be mistaken for a real practice.
  const badge = synth && (
    <p className="synth-badge">
      Synthetic input · seed {synth.seed} · {synth.preset} · headphones {synth.headphones ? 'on' : 'off'}
    </p>
  )

  let content: ReactElement
  if (screen === 'start' || !engine) {
    content = <StartScreen onStart={start} busy={busy} error={error} />
  } else if (screen === 'calibration') {
    content = (
      <>
        {banner}
        <CalibrationScreen engine={engine} synth={synthRun} existing={calibration} onDone={onCalibrated} />
      </>
    )
  } else if (screen === 'pick' || !pick || !calibration) {
    content = (
      <>
        {banner}
        <ExercisePicker
          previousBpm={pick?.bpm ?? DEFAULT_BPM}
          previousOptions={pick?.options ?? DEFAULT_SESSION_OPTIONS}
          onPick={(exercise, bpm, options) => {
            // `options` must stay the same reference for the whole session: the effect in
            // SessionScreen that owns the SessionRunner keeps `pick.options` among its dependencies
            // (see SessionScreen). If a new object came back in here on every render instead of the
            // one fixed at click time, the effect would unmount and remount the runner: the exercise
            // would restart from the top, the hits collected so far would be lost and the clicks
            // would be rescheduled. `options` arrives already fixed from ExercisePicker at "Start":
            // here it is frozen in state and never recreated.
            setPick({ exercise, bpm, options })
            setScreen('session')
          }}
          onRecalibrate={() => setScreen('calibration')}
        />
      </>
    )
  } else if (screen === 'session') {
    content = (
      <>
        {banner}
        <SessionScreen
          engine={engine}
          exercise={pick.exercise}
          bpm={pick.bpm}
          options={pick.options}
          calibration={calibration}
          onDone={onSessionDone}
          onAbort={() => setScreen('pick')}
        />
      </>
    )
  } else if (screen === 'summary' && stats) {
    content = (
      <SummaryScreen
        stats={stats}
        exercise={pick.exercise}
        bpm={pick.bpm}
        calibration={calibration}
        onRepeat={() => setScreen('session')}
        onPick={() => setScreen('pick')}
      />
    )
  } else {
    content = <StartScreen onStart={start} busy={busy} error={error} />
  }

  return (
    <>
      {badge}
      {content}
    </>
  )
}
