import { type Click, isGuide } from '../engine/grid'
import { ClickQueue, SCHEDULER_DEFAULTS } from '../engine/scheduler'
import { clickOptionsFor, scheduleClick, scheduleGuide } from './click'

export interface ClickSchedulerOptions {
  lookahead?: number
  intervalMs?: number
}

/** Schedules the clicks with lookahead on the audio clock, playing them into `dest`. Accepts additions and cuts while running (auto-increment). */
export class ClickScheduler {
  private timer: number | null = null
  private running = false
  private queue = new ClickQueue<Click>()

  constructor(
    private dest: AudioNode,
    private opts: ClickSchedulerOptions = {},
  ) {}

  add(clicks: Click[]): void {
    this.queue.add(clicks)
    if (this.running && this.timer === null) this.arm()
  }

  /**
   * A click already pulled out by `due()` has already called `osc.start()` on the audio clock and cannot be
   * withdrawn. Cutting before the reachable margin would not remove it: it would only add a
   * second click next to the one already played. The effective cut never goes below
   * `now + lookahead + intervalMs`, that is the horizon the next tick may already have committed.
   * Trade-off: at most one click inside the lookahead survives at the old tempo — still better
   * than a duplicated click, because the old one is already irrevocably on the hardware.
   *
   * Returns the effective cut (`t`, or the safety margin if that is later in time): whoever
   * adds new clicks after this call must discard those with a `t` lower than the returned
   * value, otherwise a new click can land exactly on the instant of the old one that was not
   * removed — an audible double click at the same instant.
   */
  dropAfter(t: number): number {
    const { lookahead = SCHEDULER_DEFAULTS.lookahead, intervalMs = SCHEDULER_DEFAULTS.intervalMs } = this.opts
    const safe = Math.max(t, this.dest.context.currentTime + lookahead + intervalMs / 1000)
    this.queue.dropAfter(safe)
    return safe
  }

  start(): void {
    this.running = true
    this.arm()
  }

  private arm(): void {
    if (this.timer !== null) return
    const { lookahead = SCHEDULER_DEFAULTS.lookahead, intervalMs = SCHEDULER_DEFAULTS.intervalMs } = this.opts
    const tick = () => {
      for (const c of this.queue.due(this.dest.context.currentTime, lookahead)) {
        if (c.silent) continue
        // Same queue, same lookahead, same cut at the auto-increment: only the timbre changes.
        if (isGuide(c.kind)) scheduleGuide(this.dest, c.t, c.kind === 'note-accent')
        else scheduleClick(this.dest, c.t, clickOptionsFor(c.kind))
      }
      if (this.queue.pending === 0 && this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
    tick()
    if (this.queue.pending > 0) this.timer = window.setInterval(tick, intervalMs)
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
