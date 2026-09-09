import { buildGrid, DEFAULT_METRONOME, replanGrid, repeatAt, type Click, type Grid, type MetronomeOptions } from '../engine/grid'
import { judge } from '../engine/judge'
import { nextBpm, type AutoIncrement } from '../engine/progression'
import { computeStats, type SessionStats } from '../engine/stats'
import type { Exercise, Hit, JudgeResult, Windows } from '../engine/types'
import { DEFAULT_WINDOWS } from '../engine/types'

export interface ClickSink {
  add(clicks: Click[]): void
  /** Ritorna il taglio effettivo (può essere posticipato per clamp): i click aggiunti dopo devono avere `t` ≥ quel valore. */
  dropAfter(t: number): number
  stop(): void
}

export interface RunnerDeps {
  /** tempo corrente nel clock audio, secondi */
  now(): number
  scheduleClicks(clicks: Click[]): ClickSink
  onHit(listener: (hit: Hit) => void): () => void
}

export interface RunnerConfig {
  exercise: Exercise
  bpm: number
  latencyMs: number
  slope: number | null
  windows?: Windows
  countInBars?: number
  metronome?: MetronomeOptions
  autoIncrement?: AutoIncrement
}

export type RunnerPhase = 'idle' | 'count-in' | 'playing' | 'done'

export interface RunnerState {
  phase: RunnerPhase
  grid: Grid
  result: JudgeResult
  hits: Hit[]
  /** bpm della ripetizione in corso */
  bpm: number
}

/** Collega griglia, click e colpi. I colpi entrano grezzi e vengono corretti di latenza e pendenza. */
export class SessionRunner {
  private hits: Hit[] = []
  private grid: Grid | null = null
  private clicks: ClickSink | null = null
  private unsubscribe: (() => void) | null = null
  private listeners = new Set<(s: RunnerState) => void>()
  private phase: RunnerPhase = 'idle'
  private lastEvaluatedRepeat = -1

  constructor(private deps: RunnerDeps, private cfg: RunnerConfig) {}

  start(): void {
    if (this.phase === 'count-in' || this.phase === 'playing') return
    const t0 = this.deps.now() + 0.5
    this.grid = buildGrid(this.cfg.exercise, this.cfg.bpm, t0, { countInBars: this.cfg.countInBars ?? 1, metronome: this.cfg.metronome ?? DEFAULT_METRONOME })
    this.hits = []
    this.phase = 'count-in'
    this.clicks = this.deps.scheduleClicks(this.grid.clicks)
    this.unsubscribe = this.deps.onHit((raw) => this.addHit(raw))
    this.emit()
  }

  private addHit(raw: Hit): void {
    if (!this.grid || this.phase === 'done') return
    const t = raw.t - this.cfg.latencyMs / 1000
    const s = this.cfg.slope
    const peakDb = s !== null && s > 0 ? raw.peakDb / s : raw.peakDb
    if (t < this.grid.countInEnd - this.grid.minStepDur / 2) return
    this.hits.push({ t, peakDb })
    this.emit()
  }

  /** Da chiamare periodicamente (requestAnimationFrame): aggiorna la fase e i pending. */
  tick(): RunnerState | null {
    if (!this.grid || this.phase === 'idle' || this.phase === 'done') return null
    const now = this.deps.now()
    if (this.phase === 'count-in' && now >= this.grid.countInEnd) this.phase = 'playing'
    if (this.phase === 'playing') this.maybeIncrement(now)
    if (now >= this.grid.end + this.grid.minStepDur / 2) this.finish()
    return this.snapshot()
  }

  /** Una valutazione per ripetizione, al suo inizio. Se passa, le ripetizioni da current+1 vengono ripianificate al bpm nuovo. */
  private maybeIncrement(now: number): void {
    const ai = this.cfg.autoIncrement
    if (!ai || !this.grid) return
    const r = repeatAt(this.grid, now)
    if (r === this.lastEvaluatedRepeat) return
    this.lastEvaluatedRepeat = r
    const bpm = nextBpm(this.snapshot().result, this.grid, r, ai)
    if (bpm === null) return
    this.grid = replanGrid(this.grid, this.cfg.exercise, r + 1, bpm, this.cfg.metronome ?? DEFAULT_METRONOME)
    const from = this.grid.repeats[r + 1].start
    // dropAfter può posticipare il taglio oltre `from` (clamp sul margine audio già committato): se
    // aggiungessimo comunque tutti i click da `from`, uno nuovo potrebbe cadere sullo stesso istante
    // di un vecchio non rimosso e produrre un doppio click. Si aggiungono solo i click a partire dal
    // taglio effettivo.
    const actualCut = this.clicks?.dropAfter(from) ?? from
    this.clicks?.add(this.grid.repeats.slice(r + 1).flatMap((rp) => rp.clicks).filter((c) => c.t >= actualCut))
    this.emit()
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
    const result = judge(this.grid.slots, this.hits, { windows: this.cfg.windows ?? DEFAULT_WINDOWS, now })
    const bpm = this.grid.repeats[repeatAt(this.grid, now ?? this.deps.now())].bpm
    return { phase: this.phase, grid: this.grid, result, hits: [...this.hits], bpm }
  }

  stats(): SessionStats {
    return computeStats(this.snapshot().result, {
      bpmByRepeat: this.grid?.repeats.map((r) => r.bpm) ?? [],
      guide: this.cfg.metronome?.guide === true,
    })
  }

  private emit(): void {
    const s = this.snapshot()
    this.listeners.forEach((l) => {
      l(s)
    })
  }
}
