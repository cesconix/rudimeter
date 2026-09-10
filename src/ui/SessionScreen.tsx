import { useEffect, useRef, useState } from 'react'
import { ClickScheduler } from '../audio/click-scheduler'
import { audibleTime } from '../audio/clock'
import type { Engine } from '../audio/engine'
import type { CalibrationData } from '../audio/storage'
import { repeatAt } from '../engine/grid'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'
import { type RunnerState, SessionRunner } from '../session/runner'
import { Meter } from './Meter'
import type { SessionOptions } from './options'
import { Score } from './Score'

interface Props {
  engine: Engine
  exercise: Exercise
  bpm: number
  options: SessionOptions
  calibration: CalibrationData
  onDone(stats: SessionStats): void
  onAbort(): void
}

export function SessionScreen({ engine, exercise, bpm, options, calibration, onDone, onAbort }: Props) {
  const runnerRef = useRef<SessionRunner | null>(null)
  const [state, setState] = useState<RunnerState | null>(null)

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
    const unsub = runner.subscribe(setState)
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
    }
  }, [engine, exercise, bpm, calibration, options])

  useEffect(() => {
    if (state?.phase === 'done' && runnerRef.current) onDone(runnerRef.current.stats())
  }, [state?.phase, onDone])

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
            if (r && r.snapshot().hits.length > 0) onDone(r.stats())
            else onAbort()
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
