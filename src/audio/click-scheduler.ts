import type { Click } from '../engine/grid'
import { ClickQueue } from '../engine/scheduler'
import { clickOptionsFor, scheduleClick } from './click'

export interface ClickSchedulerOptions {
  lookahead?: number
  intervalMs?: number
}

/** Schedula i click con lookahead sul clock audio. Accetta aggiunte e tagli mentre gira (auto-increment). */
export class ClickScheduler {
  private timer: number | null = null
  private running = false
  private queue = new ClickQueue<Click>()

  constructor(private ctx: AudioContext, private opts: ClickSchedulerOptions = {}) {}

  add(clicks: Click[]): void {
    this.queue.add(clicks)
    if (this.running && this.timer === null) this.arm()
  }

  dropAfter(t: number): void {
    this.queue.dropAfter(t)
  }

  start(): void {
    this.running = true
    this.arm()
  }

  private arm(): void {
    if (this.timer !== null) return
    const { lookahead = 0.1, intervalMs = 25 } = this.opts
    const tick = () => {
      for (const c of this.queue.due(this.ctx.currentTime, lookahead)) {
        if (!c.silent) scheduleClick(this.ctx, c.t, clickOptionsFor(c.kind))
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
