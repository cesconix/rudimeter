import { useEffect, useRef, useState } from 'react'
import { ClickScheduler } from '../audio/click-scheduler'
import type { Engine } from '../audio/engine'
import type { CalibrationData } from '../audio/storage'
import { DEFAULT_METRONOME, repeatAt, slotIndexAt } from '../engine/grid'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'
import { SessionRunner, type RunnerState } from '../session/runner'
import { LiveGrid } from './LiveGrid'
import { Meter } from './Meter'

interface Props {
  engine: Engine
  exercise: Exercise
  bpm: number
  calibration: CalibrationData
  onDone(stats: SessionStats): void
  onAbort(): void
}

export function SessionScreen({ engine, exercise, bpm, calibration, onDone, onAbort }: Props) {
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
      { exercise, bpm, latencyMs: calibration.latencyMs, slope: calibration.slope, metronome: DEFAULT_METRONOME },
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
  }, [engine, exercise, bpm, calibration])

  useEffect(() => {
    if (state?.phase === 'done' && runnerRef.current) onDone(runnerRef.current.stats())
  }, [state?.phase, onDone])

  if (!state) return <main><p>Avvio…</p></main>

  const now = engine.ctx.currentTime
  const { grid } = state
  const repeat = state.phase === 'done' ? grid.repeats.length - 1 : repeatAt(grid, now)
  const currentSlot = state.phase === 'done' ? -1 : slotIndexAt(grid, now)
  const judgedNow = state.result.judged.filter((j) => j.slot.repeat === repeat)

  return (
    <main>
      <div className="row">
        <h1>{exercise.name} @ {bpm} bpm</h1>
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
      <LiveGrid exercise={exercise} judged={judgedNow} currentSlot={currentSlot} repeat={repeat} />
      <p>extra: {state.result.extras.length}</p>
      <Meter engine={engine} />
    </main>
  )
}
