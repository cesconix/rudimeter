import { buildGrid, type Grid } from '../engine/grid'
import { judge } from '../engine/judge'
import { computeStats, type SessionStats } from '../engine/stats'
import type { Exercise, Hit, JudgeResult, Windows } from '../engine/types'
import { DEFAULT_WINDOWS } from '../engine/types'

export interface RunnerDeps {
  /** tempo corrente nel clock audio, secondi */
  now(): number
  scheduleClicks(times: number[], accentEvery: number): { stop(): void }
  onHit(listener: (hit: Hit) => void): () => void
}

export interface RunnerConfig {
  exercise: Exercise
  bpm: number
  latencyMs: number
  slope: number | null
  windows?: Windows
  countInBars?: number
}

export type RunnerPhase = 'idle' | 'count-in' | 'playing' | 'done'

export interface RunnerState {
  phase: RunnerPhase
  grid: Grid
  result: JudgeResult
  hits: Hit[]
}

/** Collega griglia, click e colpi. I colpi entrano grezzi e vengono corretti di latenza e pendenza. */
export class SessionRunner {
  private hits: Hit[] = []
  private grid: Grid | null = null
  private clicks: { stop(): void } | null = null
  private unsubscribe: (() => void) | null = null
  private listeners = new Set<(s: RunnerState) => void>()
  private phase: RunnerPhase = 'idle'

  constructor(private deps: RunnerDeps, private cfg: RunnerConfig) {}

  start(): void {
    const t0 = this.deps.now() + 0.5
    this.grid = buildGrid(this.cfg.exercise, this.cfg.bpm, t0, { countInBars: this.cfg.countInBars ?? 1 })
    this.hits = []
    this.phase = 'count-in'
    this.clicks = this.deps.scheduleClicks(this.grid.clickTimes, this.cfg.exercise.timeSignature[0])
    this.unsubscribe = this.deps.onHit((raw) => this.addHit(raw))
    this.emit()
  }

  private addHit(raw: Hit): void {
    if (!this.grid || this.phase === 'done') return
    const t = raw.t - this.cfg.latencyMs / 1000
    const s = this.cfg.slope
    const peakDb = s !== null && s > 0 ? raw.peakDb / s : raw.peakDb
    if (t < this.grid.countInEnd - this.grid.stepDur / 2) return
    this.hits.push({ t, peakDb })
    this.emit()
  }

  /** Da chiamare periodicamente (requestAnimationFrame): aggiorna la fase e i pending. */
  tick(): RunnerState | null {
    if (!this.grid || this.phase === 'idle' || this.phase === 'done') return null
    const now = this.deps.now()
    if (this.phase === 'count-in' && now >= this.grid.countInEnd) this.phase = 'playing'
    if (now >= this.grid.end + this.grid.stepDur / 2) this.finish()
    return this.snapshot()
  }

  stop(): void {
    this.finish()
  }

  private finish(): void {
    if (this.phase === 'done') return
    this.phase = 'done'
    this.clicks?.stop()
    this.clicks = null
    this.unsubscribe?.()
    this.unsubscribe = null
    this.emit()
  }

  subscribe(l: (s: RunnerState) => void): () => void {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  snapshot(): RunnerState {
    if (!this.grid) throw new Error('runner non avviato')
    const now = this.phase === 'done' ? undefined : this.deps.now()
    const result = judge(this.grid.slots, this.hits, { halfWindow: this.grid.stepDur / 2, windows: this.cfg.windows ?? DEFAULT_WINDOWS, now })
    return { phase: this.phase, grid: this.grid, result, hits: this.hits }
  }

  stats(): SessionStats {
    return computeStats(this.snapshot().result)
  }

  private emit(): void {
    const s = this.snapshot()
    this.listeners.forEach((l) => l(s))
  }
}
