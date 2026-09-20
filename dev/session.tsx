import {
  type ComponentType,
  type ReactElement,
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_THRESHOLDS } from '../src/audio/capture'
import { audibleTime } from '../src/audio/clock'
import { createEngine, describeMicError, type Engine } from '../src/audio/engine'
import {
  type CalibrationData,
  type KeyValueStore,
  loadCalibration,
  memoryStore,
  saveCalibration,
} from '../src/audio/storage'
import { EXERCISES } from '../src/data/exercises'
import type { Remote } from '../src/dev/remote'
import { remoteNameFrom } from '../src/dev/remote-name'
import { DEFAULT_AUTO_INCREMENT } from '../src/engine/progression'
import type { SessionStats } from '../src/engine/stats'
import type { Exercise } from '../src/engine/types'
import { parseSynthConfig } from '../src/sim/config'
import { createSynthGraph, type SynthGraph, type SynthRun } from '../src/sim/graph'
import { APP_INFO } from '../src/telemetry/app-info'
import type { Telemetry } from '../src/telemetry/client'
import type { FeedbackProps } from '../src/telemetry/feedback'
import { forgetTester, readTester, rememberTester, type Tester, withoutTester } from '../src/telemetry/tester'
import { CalibrationScreen } from '../src/ui/CalibrationScreen'
import { ExercisePicker } from '../src/ui/ExercisePicker'
import { DEFAULT_SESSION_OPTIONS, type SessionOptions } from '../src/ui/options'
import { SessionScreen } from '../src/ui/SessionScreen'
import { StartScreen } from '../src/ui/StartScreen'
import { SummaryScreen } from '../src/ui/SummaryScreen'
import '../src/ui/styles.css'

// Dev page: the session flow as it was before the score became the app — start → calibration →
// picker → session → summary, the microphone, the judge, the synthetic drummer (`?synth=`), the
// remote channel's session commands. Moved here whole from src/ui/App.tsx (plan 11) and kept
// running until the judge comes back on top of the score as a highlight source. Nothing under
// src/ imports this file; nothing of it reaches the production bundle.

type Screen = 'start' | 'calibration' | 'pick' | 'session' | 'summary'

const DEFAULT_BPM = 60

function SessionApp() {
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

  // `?remote[=name]`, dev server only: the page logs what it does and takes commands from `bun run remote`
  // (see dev/remote/plugin.ts). The client is loaded on demand so that none of it is in the production bundle.
  const remoteName = useMemo(
    () =>
      import.meta.env.DEV
        ? remoteNameFrom(window.location.search, navigator.userAgent, 'ontouchend' in document)
        : null,
    [],
  )
  // `?tester=<key>` or the stored one: the page shares its sessions with the store behind rudimeter.com.
  // Read once, and the key leaves the URL at once: it is a secret, and the address bar is no place for it.
  const tester = useMemo<Tester | null>(() => {
    const t = readTester(window.location.search, localStorage)
    if (t && new URLSearchParams(window.location.search).has('tester'))
      window.history.replaceState(null, '', withoutTester(window.location.href))
    return t
  }, [])
  const [remote, setRemote] = useState<Remote | null>(null)
  // Whatever the page logs to: the dev channel (which is also a Telemetry) or the tester's client.
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  // The feedback box loads next to whatever client is up: the component sits in state, null until its
  // chunk lands, and the summary renders it only next to a live `telemetry`.
  const [FeedbackBox, setFeedbackBox] = useState<ComponentType<FeedbackProps> | null>(null)
  // The name the server settled on, which is not always the one asked for: a second page from the same
  // phone is named `iphone-2` and writes `iphone-2.ndjson`. `Remote.name` is a getter and the `hello`
  // that sets it re-renders nothing, so the badge would keep showing the wanted name. Null until `hello`.
  // A tester's stored name shows at once; the dev channel settles at hello.
  const [settledName, setSettledName] = useState<string | null>(() => (remoteName ? null : (tester?.name ?? null)))
  const [notice, setNotice] = useState<string | null>(null)
  const [calibrateSignal, setCalibrateSignal] = useState(0)
  const sessionControls = useRef<{ stop(): void } | null>(null)
  // The summary's box needs the id of the session it closes: `session:start` is logged through
  // `logEvent`, so this is where its `at` is seen. React StrictMode logs `session:start` twice a
  // millisecond apart and the analysis keeps the second one, which is also the last one seen here.
  const sessionStartAt = useRef<string | null>(null)
  useEffect(() => {
    let t: Telemetry | null = null
    let cancelled = false
    const say = (text: string, seconds: number) => {
      setNotice(text)
      window.setTimeout(() => setNotice((n) => (n === text ? null : n)), seconds * 1000)
    }
    if (import.meta.env.DEV && remoteName) {
      // The `import()` sits inside a bare `import.meta.env.DEV` block and not behind `remoteName`
      // alone: Vite rewrites the flag to `false` when building and the bundler drops a statically
      // false branch whole, dynamic import included. `remoteName` is a runtime value, so guarding on
      // it proves nothing to the bundler and the client shipped anyway as its own production chunk
      // (dist/assets/remote-*.js, 2.2 kB of `__remote`). knip reads the source, where the import is
      // always there, so it still follows it.
      import('../src/dev/remote').then((m) => {
        if (cancelled) return
        const r = m.connectRemote(remoteName, navigator.userAgent, { onName: setSettledName })
        m.registerBasics(r, say)
        t = r
        setRemote(r)
        setTelemetry(r)
      })
    } else if (tester) {
      // Not behind the DEV guard on purpose: this chunk ships, and loads only on a page that has a key.
      import('../src/telemetry/client').then((m) => {
        if (cancelled) return
        t = m.connectTelemetry({
          name: tester.name ?? '…',
          endpoint: () => m.apiLogEndpoint(tester.key),
          flushMs: 2000,
          onName: (name) => {
            setSettledName(name)
            rememberTester(localStorage, { key: tester.key, name })
          },
        })
        t.log('hello', { ua: navigator.userAgent, url: window.location.href, app: APP_INFO })
        setTelemetry(t)
      })
    } else return
    // The feedback box rides whichever client is up: its chunk ships, and loads only next to one.
    import('../src/telemetry/feedback').then((m) => {
      if (cancelled) return
      setFeedbackBox(() => m.FeedbackBox)
    })
    return () => {
      cancelled = true
      t?.close()
    }
  }, [remoteName, tester])

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

  // What the remote operator cannot see from the Mac: which input the page really opened, how far the
  // audible clock trails the scheduling one, and every onset the detector fires.
  useEffect(() => {
    if (!telemetry || !engine) return
    const ctx = engine.ctx
    telemetry.log('engine', {
      deviceLabel: engine.capture.info?.deviceLabel ?? '',
      settings: engine.capture.info?.settings ?? {},
      sampleRate: ctx.sampleRate,
      baseLatencyMs: typeof ctx.baseLatency === 'number' ? ctx.baseLatency * 1000 : null,
      outputLatencyMs: typeof ctx.outputLatency === 'number' ? ctx.outputLatency * 1000 : null,
      floorDb: DEFAULT_THRESHOLDS.floorDb,
      synth: synth ?? null,
    })
    let bgDb = -120
    const offMeter = engine.capture.onMeter((m) => {
      bgDb = m.bgDb
    })
    const offHit = engine.capture.onHit((h) => telemetry.log('hit', { t: h.t, peakDb: h.peakDb }))
    // One line a second: enough to see the output latency drift or the context fall asleep, few enough
    // that a 10-minute session stays readable.
    const timer = window.setInterval(
      () =>
        telemetry.log('output', {
          ctxTime: ctx.currentTime,
          outputMs: (ctx.currentTime - audibleTime(ctx)) * 1000,
          bgDb,
          state: ctx.state,
        }),
      1000,
    )
    return () => {
      offMeter()
      offHit()
      clearInterval(timer)
    }
  }, [telemetry, engine, synth])

  useEffect(() => {
    telemetry?.log('screen', { screen })
  }, [telemetry, screen])

  // `start` reports a failure through the `error` state, which the remote `arm` handler cannot read
  // back: that closure captured `error` on the render that registered it. Keep the last message here so
  // `arm` can answer with the real reason instead of a bare "the engine did not come up".
  const startError = useRef<string | null>(null)

  // `useCallback`: the commands effect below keeps `start` among its dependencies, and a new function
  // on every render would unregister and re-register every handler each time. It resolves with the
  // engine, or null when it failed: the `arm` command needs to tell the two apart (the human in front
  // of the page reads the `error` state instead).
  const start = useCallback(async (): Promise<Engine | null> => {
    setBusy(true)
    setError(null)
    startError.current = null
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
      return e
    } catch (err) {
      const message = describeMicError(err)
      startError.current = message
      setError(message)
      return null
    } finally {
      setBusy(false)
    }
  }, [synth, calibration])

  function onCalibrated(data: CalibrationData) {
    // In private Safari setItem throws: the calibration stays valid for this session,
    // it will be redone on the next start. Losing the save must not bring the page down.
    try {
      saveCalibration(store, data)
    } catch {
      // Ignore: storing it is an optimization, not a requirement.
    }
    telemetry?.log('calibration:done', { ...data })
    setCalibration(data)
    setScreen('pick')
  }

  const onSessionDone = useCallback((s: SessionStats) => {
    setStats(s)
    setScreen('summary')
  }, [])

  // Stable identities: SessionScreen keeps both among the dependencies of the effect that owns the
  // runner, and a new function on every render would restart the session from the top.
  const logEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      // `session:start` names the build, so a session can be re-judged tomorrow with the rules of its day.
      const at = telemetry?.log(event, event === 'session:start' ? { ...data, app: APP_INFO } : data) ?? null
      if (event === 'session:start') sessionStartAt.current = at
    },
    [telemetry],
  )
  const registerSession = useCallback((c: { stop(): void } | null) => {
    sessionControls.current = c
  }, [])

  useEffect(() => {
    if (!remote) return
    const offs = [
      remote.on('screen', () => ({ screen, engine: engine !== null, calibration })),
      remote.on('arm', async () => {
        if (engine) return 'already armed'
        // A denied microphone or a missing input leaves `start` with nothing: answering `armed` would
        // send the operator on the Mac into a session with a dead engine, every later command failing
        // with "not armed" and no reason. Throw, so the channel answers `cmd:error` with the reason.
        if ((await start()) === null) throw new Error(startError.current ?? 'the engine did not come up')
        return 'armed'
      }),
      remote.on('calibrate', () => {
        if (!engine) throw new Error('not armed: tap Start on the device first')
        setScreen('calibration')
        setCalibrateSignal((n) => n + 1)
      }),
      remote.on('use-saved', () => {
        if (!engine) throw new Error('not armed')
        if (!calibration) throw new Error('no saved calibration')
        setScreen('pick')
      }),
      remote.on('start', (args) => {
        if (!engine) throw new Error('not armed')
        if (!calibration) throw new Error('not calibrated')
        const exercise = EXERCISES.find((e) => e.id === args.exercise)
        if (!exercise)
          throw new Error(`unknown exercise "${String(args.exercise)}"; ids: ${EXERCISES.map((e) => e.id).join(', ')}`)
        const bpm = Number(args.bpm ?? DEFAULT_BPM)
        if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) throw new Error(`bpm out of range: ${String(args.bpm)}`)
        const clicks = Number(args.clicks ?? 1)
        const options: SessionOptions = {
          metronome: {
            clickSubdivision: (clicks === 2 || clicks === 3 || clicks === 4 ? clicks : 1) as 1 | 2 | 3 | 4,
            gap: args.gap === true ? { on: 2, off: 2 } : undefined,
            guide: args.guide === true,
          },
          autoIncrement: args.auto === true ? DEFAULT_AUTO_INCREMENT : null,
        }
        setPick({ exercise, bpm, options })
        setScreen('session')
        return { exercise: exercise.id, bpm, options }
      }),
      remote.on('stop', () => {
        if (!sessionControls.current) throw new Error('no session running')
        sessionControls.current.stop()
      }),
      remote.on('record', async (args) => {
        if (!engine) throw new Error('not armed')
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)))
        const tap = engine.ctx.createGain()
        const untap = engine.capture.tap(tap)
        try {
          return await remote.record(engine.ctx, tap, seconds, String(args.label ?? 'mic'))
        } finally {
          untap()
        }
      }),
      remote.on('reload', () => {
        // 300 ms: long enough for the `cmd:done` flush to leave before the page tears the channel down.
        window.setTimeout(() => window.location.reload(), 300)
      }),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [remote, engine, calibration, screen, start])

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

  const stopSharing = () => {
    forgetTester(localStorage)
    telemetry?.close()
    setTelemetry(null)
    setSettledName(null)
  }
  // Which name the server settled on: the operator needs it to aim `--to`, a tester sees whose sessions
  // these are. Before the first answer there is nothing settled yet, hence the `…`.
  const telemetryBadge =
    telemetry &&
    (remote ? (
      <p className="synth-badge">Remote · {settledName ?? `${remoteName}…`}</p>
    ) : (
      <p className="synth-badge">
        Sharing sessions as {settledName ?? '…'} — stroke timing, levels, calibration and your comments. Never audio.{' '}
        <button type="button" className="secondary" onClick={stopSharing}>
          Stop
        </button>
      </p>
    ))
  const overlay = notice && <p className="big notice">{notice}</p>

  let content: ReactElement
  if (screen === 'start' || !engine) {
    content = <StartScreen onStart={start} busy={busy} error={error} />
  } else if (screen === 'calibration') {
    content = (
      <>
        {banner}
        <CalibrationScreen
          engine={engine}
          synth={synthRun}
          existing={calibration}
          onDone={onCalibrated}
          runSignal={calibrateSignal}
          onMeasured={(m) =>
            telemetry?.log(m.latencyMs === null ? 'calibration:failed' : 'calibration:measured', { ...m })
          }
        />
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
          onRecalibrate={() => {
            // Spend the signal before showing the screen: it outlives the remote `calibrate` that set
            // it, and a freshly mounted CalibrationScreen would read it as an order — 8 clicks with no
            // warning, then saved and gone — while the human is still reading the instructions.
            setCalibrateSignal(0)
            setScreen('calibration')
          }}
        />
      </>
    )
  } else if (screen === 'session') {
    content = (
      <>
        {banner}
        <SessionScreen
          engine={engine}
          synth={synthRun}
          exercise={pick.exercise}
          bpm={pick.bpm}
          options={pick.options}
          calibration={calibration}
          onDone={onSessionDone}
          onAbort={() => setScreen('pick')}
          onEvent={logEvent}
          register={registerSession}
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
      >
        {telemetry && FeedbackBox && (
          <FeedbackBox
            remote={telemetry}
            sessionId={
              settledName === null || sessionStartAt.current === null
                ? null
                : `${settledName}@${sessionStartAt.current}`
            }
          />
        )}
      </SummaryScreen>
    )
  } else {
    content = <StartScreen onStart={start} busy={busy} error={error} />
  }

  return (
    <>
      {badge}
      {telemetryBadge}
      {overlay}
      {content}
    </>
  )
}

// biome-ignore lint/style/noNonNullAssertion: #root is hardcoded in session.html; without it the page cannot boot and must fail loudly.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionApp />
  </StrictMode>,
)
