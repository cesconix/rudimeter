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

  /**
   * Un click già estratto da `due()` ha già chiamato `osc.start()` sul clock audio e non può essere
   * ritirato. Tagliare prima del margine raggiungibile non lo rimuoverebbe: aggiungerebbe solo un
   * secondo click accanto a quello già suonato. Il taglio effettivo non scende mai sotto
   * `now + lookahead + intervalMs`, cioè l'orizzonte che il prossimo tick può già aver committato.
   * Compromesso: al più un click dentro il lookahead sopravvive al tempo vecchio — comunque meglio
   * di un click duplicato, perché quello vecchio è già irrevocabilmente sull'hardware.
   *
   * Ritorna il taglio effettivo (`t`, o il margine di sicurezza se più avanti nel tempo): chi
   * aggiunge nuovi click dopo questa chiamata deve scartare quelli con `t` inferiore al valore
   * ritornato, altrimenti un nuovo click può cadere esattamente sull'istante del vecchio non
   * rimosso — un doppio click udibile nello stesso istante.
   */
  dropAfter(t: number): number {
    const { lookahead = 0.1, intervalMs = 25 } = this.opts
    const safe = Math.max(t, this.ctx.currentTime + lookahead + intervalMs / 1000)
    this.queue.dropAfter(safe)
    return safe
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
