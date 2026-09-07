import type { Grid } from './grid'
import type { JudgeResult, Judged } from './types'

export interface AutoIncrement {
  /** bpm da aggiungere */
  step: number
  /** ripetizioni consecutive pulite richieste (>= 1: precondizione non validata, vedi `nextBpm`) */
  after: number
  /** (good + ok) / slot minimo */
  minAccuracy: number
  maxBpm: number
}

export const DEFAULT_AUTO_INCREMENT: AutoIncrement = { step: 4, after: 4, minAccuracy: 0.9, maxBpm: 240 }

export function repeatAccuracy(judged: Judged[], repeat: number): { slots: number; passing: number; miss: number; accuracy: number } {
  const own = judged.filter((j) => j.slot.repeat === repeat)
  const passing = own.filter((j) => j.grade === 'good' || j.grade === 'ok').length
  const miss = own.filter((j) => j.grade === 'miss').length
  return { slots: own.length, passing, miss, accuracy: own.length ? passing / own.length : 0 }
}

/**
 * All'inizio della ripetizione `current`: se le `after` precedenti sono tutte al bpm corrente,
 * senza miss e sopra `minAccuracy`, il bpm per `current + 1`; altrimenti null.
 */
export function nextBpm(result: JudgeResult, grid: Grid, current: number, ai: AutoIncrement): number | null {
  if (current < ai.after || current + 1 >= grid.repeats.length) return null
  const bpm = grid.repeats[current].bpm
  for (let r = current - ai.after; r < current; r++) {
    if (grid.repeats[r].bpm !== bpm) return null
    const a = repeatAccuracy(result.judged, r)
    if (a.slots === 0 || a.miss > 0 || a.accuracy < ai.minAccuracy) return null
  }
  const next = Math.min(bpm + ai.step, ai.maxBpm)
  return next > bpm ? next : null
}
