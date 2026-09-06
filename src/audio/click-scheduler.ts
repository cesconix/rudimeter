import { dueIndices } from '../engine/scheduler'
import { scheduleClick } from './click'

export interface ClickSchedulerOptions {
  /** ogni quanti click un accento (es. i beat per battuta); 0 = mai */
  accentEvery?: number
  lookahead?: number
  intervalMs?: number
}

/** Schedula i click di `times` con lookahead sul clock audio. Si ferma da solo a fine lista. */
export class ClickScheduler {
  private timer: number | null = null
  private next = 0

  constructor(private ctx: AudioContext, private times: number[], private opts: ClickSchedulerOptions = {}) {}

  start(): void {
    this.stop()
    const { lookahead = 0.1, intervalMs = 25, accentEvery = 0 } = this.opts
    const tick = () => {
      const { indices, next } = dueIndices(this.times, this.next, this.ctx.currentTime, lookahead)
      for (const i of indices) {
        const accent = accentEvery > 0 && i % accentEvery === 0
        scheduleClick(this.ctx, this.times[i], accent ? { freq: 1500, gain: 0.6 } : {})
      }
      this.next = next
      if (this.next >= this.times.length) this.stop()
    }
    tick()
    this.timer = window.setInterval(tick, intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
