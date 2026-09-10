import type { Grid } from '../engine/grid'
import { ClickQueue } from '../engine/scheduler'
import { type PlayerModel, planStrokes, type Stroke } from './player'
import { scheduleStroke } from './stroke'

export interface DrummerOptions {
  lookahead?: number
  intervalMs?: number
}

/**
 * Plays the strokes of the grid it follows, with lookahead on the audio clock like the ClickScheduler.
 * `follow` acts only on a new grid object (start, auto-increment replan). On a replan the pending
 * future is cut at the same horizon `ClickScheduler.dropAfter` uses — what the next tick may already
 * have committed stays — and planned again from there. The strokes are deterministic per slot index
 * (see `planStrokes`), so a slot the replan keeps gets the stroke it had; only the moved repeats change.
 */
export class Drummer {
  private queue = new ClickQueue<Stroke>()
  // Global timer, not window.setInterval: the drummer also runs under bun test, where there is no window.
  private timer: ReturnType<typeof setInterval> | null = null
  private grid: Grid | null = null

  constructor(
    private dest: AudioNode,
    private model: PlayerModel,
    private seed: number,
    private opts: DrummerOptions = {},
  ) {}

  follow(state: { grid: Grid }): void {
    if (state.grid === this.grid) return
    const replan = this.grid !== null
    this.grid = state.grid
    let strokes = planStrokes(state.grid.slots, this.model, this.seed)
    if (replan) {
      const { lookahead = 0.1, intervalMs = 25 } = this.opts
      const cut = this.dest.context.currentTime + lookahead + intervalMs / 1000
      this.queue.dropAfter(cut)
      strokes = strokes.filter((s) => s.t >= cut)
    }
    this.queue.add(strokes)
    this.arm()
  }

  private arm(): void {
    if (this.timer !== null) return
    const { lookahead = 0.1, intervalMs = 25 } = this.opts
    const tick = () => {
      for (const s of this.queue.due(this.dest.context.currentTime, lookahead)) {
        scheduleStroke(this.dest, s.t, s.peakDb)
      }
      if (this.queue.pending === 0 && this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
    tick()
    if (this.queue.pending > 0) this.timer = setInterval(tick, intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
