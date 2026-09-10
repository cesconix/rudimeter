import type { Grid, MetronomeOptions } from '../engine/grid'
import type { AutoIncrement } from '../engine/progression'
import { ClickQueue } from '../engine/scheduler'
import type { SessionStats } from '../engine/stats'
import type { Exercise, Hit } from '../engine/types'
import { type RunnerDeps, SessionRunner } from '../session/runner'
import { PLAYER_PRESETS, type PlayerPreset, planStrokes, type Stroke } from './player'

export interface OracleConfig {
  exercise: Exercise
  bpm: number
  preset: PlayerPreset
  seed: number
  metronome?: MetronomeOptions
  autoIncrement?: AutoIncrement
}

/** Virtual clock step, seconds. The strokes carry their own exact time: the step only paces the runner's `tick`. */
const STEP = 0.01

/**
 * What the browser must report for the same seed: the SessionRunner on a virtual clock, fed the
 * strokes the Drummer plays. Latency 0 and slope null — in the browser the synthetic air adds
 * 35 ms and the calibration takes them away again, so the runner sees the strokes where the drummer
 * put them. The drummer is mirrored inline: a new grid object cuts the future and plans it again.
 */
export function runOracle(cfg: OracleConfig): SessionStats {
  let now = 0
  let listener: ((h: Hit) => void) | null = null
  const deps: RunnerDeps = {
    now: () => now,
    scheduleClicks: () => ({
      add() {
        // The oracle has no speaker.
      },
      dropAfter: (t) => t,
      stop() {
        // Nothing to stop.
      },
    }),
    onHit: (l) => {
      listener = l
      return () => {
        listener = null
      }
    },
  }
  // Routed through a closure, not called as `listener?.(h)` straight in the loop below: this
  // TypeScript build narrows a `let` reassigned only inside a nested function to `never` at a
  // same-scope read, the same shape `runner.test.ts`'s `fakeDeps` already sidesteps with `hit: (h) => listener?.(h)`.
  const feed = (h: Hit) => listener?.(h)
  const runner = new SessionRunner(deps, {
    exercise: cfg.exercise,
    bpm: cfg.bpm,
    latencyMs: 0,
    slope: null,
    metronome: cfg.metronome,
    autoIncrement: cfg.autoIncrement,
  })
  const model = PLAYER_PRESETS[cfg.preset]
  const queue = new ClickQueue<Stroke>()
  let grid: Grid | null = null
  runner.subscribe((s) => {
    if (s.grid === grid) return
    grid = s.grid
    queue.dropAfter(now)
    queue.add(planStrokes(s.grid.slots, model, cfg.seed).filter((st) => st.t >= now))
  })
  runner.start()
  while (runner.snapshot().phase !== 'done') {
    now += STEP
    for (const st of queue.due(now, 0)) feed({ t: st.t, peakDb: st.peakDb })
    runner.tick()
  }
  return runner.stats()
}
