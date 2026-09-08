import { useEffect, useRef, useState } from 'react'
import { ClickScheduler } from '../audio/click-scheduler'
import { audibleTime } from '../audio/clock'
import type { Engine } from '../audio/engine'
import type { CalibrationData } from '../audio/storage'
import { repeatAt } from '../engine/grid'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'
import { SessionRunner, type RunnerState } from '../session/runner'
import type { SessionOptions } from './App'
import { Meter } from './Meter'
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

  useEffect(() => {
    const runner = new SessionRunner(
      {
        now: () => engine.ctx.currentTime,
        scheduleClicks: (clicks) => {
          const s = new ClickScheduler(engine.ctx)
          s.add(clicks)
          s.start()
          return s
        },
        onHit: (l) => engine.capture.onHit(l),
      },
      { exercise, bpm, latencyMs: calibration.latencyMs, slope: calibration.slope, metronome: options.metronome, autoIncrement: options.autoIncrement ?? undefined },
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

  if (!state) return <main><p>Avvio…</p></main>

  // Clock udibile, non quello di schedulazione: il disegno deve stare col suono che esce, non col
  // suono prenotato (vedi audibleTime). Il runner sopra continua a schedulare su `currentTime`.
  const now = audibleTime(engine.ctx)
  const { grid } = state
  const repeat = state.phase === 'done' ? grid.repeats.length - 1 : repeatAt(grid, now)

  return (
    <main>
      <div className="row">
        <h1>{exercise.name} @ {state.bpm} bpm</h1>
        <p>Ripetizione {Math.min(repeat + 1, exercise.repeats)} / {exercise.repeats}</p>
        <button
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
      <p>extra: {state.result.extras.length}{state.result.absorbed.length > 0 ? ` · assorbiti: ${state.result.absorbed.length}` : ''}</p>
      <Meter engine={engine} />
    </main>
  )
}
