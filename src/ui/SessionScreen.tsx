import { useEffect, useRef, useState } from 'react'
import { ClickScheduler } from '../audio/click-scheduler'
import { audibleTime } from '../audio/clock'
import type { Engine } from '../audio/engine'
import type { CalibrationData } from '../audio/storage'
import { repeatAt } from '../engine/grid'
import { toMarkdown } from '../engine/report'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'
import { type RunnerState, SessionRunner } from '../session/runner'
import { Drummer } from '../sim/drummer'
import type { SynthRun } from '../sim/graph'
import { PLAYER_PRESETS } from '../sim/player'
import { Meter } from './Meter'
import type { SessionOptions } from './options'
import { Score } from './Score'

interface Props {
  engine: Engine
  synth: SynthRun | null
  exercise: Exercise
  bpm: number
  options: SessionOptions
  calibration: CalibrationData
  onDone(stats: SessionStats): void
  onAbort(): void
  /** Remote log: `session:start`, `session:replan`, `session:done`. */
  onEvent?(event: string, data: Record<string, unknown>): void
  /** Hands the remote layer a way to stop this session; called with null on unmount. */
  register?(controls: { stop(): void } | null): void
}

export function SessionScreen({
  engine,
  synth,
  exercise,
  bpm,
  options,
  calibration,
  onDone,
  onAbort,
  onEvent,
  register,
}: Props) {
  const runnerRef = useRef<SessionRunner | null>(null)
  const [state, setState] = useState<RunnerState | null>(null)
  // Stopping from the button ends the session AND flips the phase to `done`: without this the effect
  // below would log a second `session:done` for the same run.
  const doneRef = useRef(false)

  // `options` is a dependency down below and must stay reference-stable for the whole session: App
  // fixes it once and for all in `pick.options` at pick time (see App.tsx) and never recreates it
  // while this screen is mounted. If one day an object recreated on every render arrived here (e.g.
  // an in-session transport control, or a spread `{...options, x}`), this effect would unmount and
  // remount the SessionRunner on every render: the exercise would restart from the top, the hits
  // collected so far would be lost and the clicks would be rescheduled.
  useEffect(() => {
    const runner = new SessionRunner(
      {
        now: () => engine.ctx.currentTime,
        scheduleClicks: (clicks) => {
          const s = new ClickScheduler(engine.out)
          s.add(clicks)
          s.start()
          return s
        },
        onHit: (l) => engine.capture.onHit(l),
      },
      {
        exercise,
        bpm,
        latencyMs: calibration.latencyMs,
        slope: calibration.slope,
        metronome: options.metronome,
        autoIncrement: options.autoIncrement ?? undefined,
      },
    )
    runnerRef.current = runner
    register?.({
      stop: () => {
        runner.stop()
      },
    })
    // Synthetic input: the drummer plays whatever grid the runner schedules, and the headphones go
    // on (or stay off) for the session exactly as a person would do after the calibration.
    const drummer = synth
      ? new Drummer(synth.graph.strokes, PLAYER_PRESETS[synth.config.preset], synth.config.seed)
      : null
    synth?.graph.setHeadphones(synth.config.headphones)
    // The whole plan, so the remote side can check every stroke and every click without guessing what
    // the runner scheduled. A new `grid` object is the runner replanning (auto-increment): report it.
    const describe = (s: RunnerState) => ({
      exerciseId: exercise.id,
      bpm: s.bpm,
      options,
      latencyMs: calibration.latencyMs,
      slope: calibration.slope,
      slots: s.grid.slots.map((sl) => ({
        i: sl.index,
        t: sl.t,
        hand: sl.step.hand,
        accent: sl.step.accent,
        repeat: sl.repeat,
      })),
      clicks: s.grid.clicks.map((c) => ({ t: c.t, kind: c.kind, silent: c.silent === true })),
    })
    let lastGrid: RunnerState['grid'] | null = null
    const unsub = runner.subscribe((s) => {
      drummer?.follow(s)
      if (s.grid !== lastGrid) {
        onEvent?.(lastGrid === null ? 'session:start' : 'session:replan', describe(s))
        lastGrid = s.grid
      }
      setState(s)
    })
    runner.start()
    let raf = 0
    const loop = () => {
      const s = runner.tick()
      if (s) setState(s)
      if (!s || s.phase === 'done') return
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
      runner.stop()
      drummer?.stop()
      register?.(null)
      // Headphones off again: the calibration screen expects the speaker path open.
      synth?.graph.setHeadphones(false)
    }
  }, [engine, synth, exercise, bpm, calibration, options, onEvent, register])

  useEffect(() => {
    if (state?.phase === 'done' && runnerRef.current && !doneRef.current) {
      doneRef.current = true
      const stats = runnerRef.current.stats()
      onEvent?.('session:done', {
        exerciseId: exercise.id,
        bpm,
        stats,
        markdown: toMarkdown(stats, exercise, bpm, new Date(), calibration),
      })
      onDone(stats)
    }
  }, [state?.phase, onDone, onEvent, exercise, bpm, calibration])

  if (!state)
    return (
      <main>
        <p>Starting…</p>
      </main>
    )

  // Audible clock, not the scheduling one: the drawing has to stay with the sound going out, not
  // with the sound booked (see audibleTime). The runner above keeps scheduling on `currentTime`.
  const now = audibleTime(engine.ctx)
  const { grid } = state
  const repeat = state.phase === 'done' ? grid.repeats.length - 1 : repeatAt(grid, now)

  return (
    // `session`: a column that fills the window, so the score takes the space left over instead of
    // a fixed height. The full height lives on the container and not here, because this <main> can
    // have a sibling — the "Audio paused" banner of App (see styles.css).
    <main className="session">
      <div className="row">
        <h1>
          {exercise.name} @ {state.bpm} bpm
        </h1>
        <p>
          Repeat {Math.min(repeat + 1, exercise.repeats)} / {exercise.repeats}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const r = runnerRef.current
            r?.stop()
            if (r && r.snapshot().hits.length > 0) {
              const stats = r.stats()
              if (!doneRef.current) {
                doneRef.current = true
                onEvent?.('session:done', {
                  exerciseId: exercise.id,
                  bpm,
                  stats,
                  markdown: toMarkdown(stats, exercise, bpm, new Date(), calibration),
                  stopped: true,
                })
              }
              onDone(stats)
            } else onAbort()
          }}
        >
          Stop
        </button>
      </div>
      {state.phase === 'count-in' && <p className="big">Count-in…</p>}
      <Score exercise={exercise} grid={grid} judged={state.result.judged} now={now} />
      <p>
        extra: {state.result.extras.length}
        {state.result.absorbed.length > 0 ? ` · absorbed: ${state.result.absorbed.length}` : ''}
      </p>
      <Meter engine={engine} />
    </main>
  )
}
