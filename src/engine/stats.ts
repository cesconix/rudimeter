import type { Hand, Hit, Judged, JudgeResult } from './types'

export interface HandStats {
  hand: Hand
  slots: number
  hits: number
  meanOffsetMs: number | null
  sdOffsetMs: number | null
  meanDb: number | null
  sdDb: number | null
}

export interface BlockStats {
  fromRepeat: number
  toRepeat: number
  slots: number
  miss: number
  sdOffsetMs: number | null
  meanDb: number | null
}

export interface UniformityStats {
  /** σ dei dB dei colpi non accentati */
  sdDbTaps: number | null
  hands: { hand: Hand; sdDbTaps: number | null }[]
}

export interface AccentStats {
  slots: number
  hits: number
  /** media dB(accenti) − media dB(non accentati) */
  meanDeltaDb: number | null
  /** accenti colpiti che stanno sotto la soglia rispetto alla media dei non accentati; null se non ci sono taps a cui confrontarli */
  belowThreshold: number | null
  thresholdDb: number
}

export interface StatsOptions {
  blockSize?: number
  bpmByRepeat?: number[]
  accentThresholdDb?: number
  /** Il suono guida era attivo: vedi `SessionStats.guide`. */
  guide?: boolean
}

export interface SessionStats {
  slots: number
  good: number
  ok: number
  off: number
  miss: number
  pending: number
  extras: number
  meanOffsetMs: number | null
  sdOffsetMs: number | null
  hands: HandStats[]
  blocks: BlockStats[]
  absorbed: number
  uniformity: UniformityStats
  accents: AccentStats
  bpmByRepeat: number[]
  /**
   * Il suono guida era attivo durante la sessione. Non è una statistica: è la condizione in cui il
   * risultato è stato ottenuto, e va col risultato ovunque vada. Con la guida attiva e senza cuffie
   * il microfono sente i colpi della guida sugli istanti attesi, e questi numeri descrivono
   * un'esecuzione perfetta che non è avvenuta — senza questo campo, indistinguibile da un record.
   */
  guide: boolean
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Deviazione standard campionaria (n − 1). */
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs) as number
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

const offsets = (js: Judged[]): number[] => js.flatMap((j) => (j.offsetMs === null ? [] : [j.offsetMs]))
const dbs = (js: Judged[]): number[] => js.flatMap((j) => (j.hit ? [j.hit.peakDb] : []))

export function computeStats(result: JudgeResult, opts: StatsOptions = {}): SessionStats {
  const blockSize = opts.blockSize ?? 5
  const thresholdDb = opts.accentThresholdDb ?? 6
  const js = result.judged
  const count = (g: Judged['grade']) => js.filter((j) => j.grade === g).length

  const hands: HandStats[] = (['R', 'L'] as Hand[])
    .map((hand) => {
      const own = js.filter((j) => j.slot.step.hand === hand)
      return {
        hand,
        slots: own.length,
        hits: own.filter((j) => j.hit).length,
        meanOffsetMs: mean(offsets(own)),
        sdOffsetMs: sd(offsets(own)),
        meanDb: mean(dbs(own)),
        sdDb: sd(dbs(own)),
      }
    })
    .filter((h) => h.slots > 0)

  const maxRepeat = js.reduce((m, j) => Math.max(m, j.slot.repeat), -1)
  const blocks: BlockStats[] = []
  for (let from = 0; from <= maxRepeat; from += blockSize) {
    const to = Math.min(from + blockSize - 1, maxRepeat)
    const own = js.filter((j) => j.slot.repeat >= from && j.slot.repeat <= to)
    blocks.push({
      fromRepeat: from,
      toRepeat: to,
      slots: own.length,
      miss: own.filter((j) => j.grade === 'miss').length,
      sdOffsetMs: sd(offsets(own)),
      meanDb: mean(dbs(own)),
    })
  }

  const taps = js.filter((j) => j.hit && !j.slot.step.accent)
  const accented = js.filter((j) => j.slot.step.accent)
  const tapMean = mean(dbs(taps))
  const accentHits = accented.filter((j) => j.hit)
  const uniformity: UniformityStats = {
    sdDbTaps: sd(dbs(taps)),
    hands: (['R', 'L'] as Hand[])
      .map((hand) => ({ hand, sdDbTaps: sd(dbs(taps.filter((j) => j.slot.step.hand === hand))) }))
      .filter((h) => taps.some((j) => j.slot.step.hand === h.hand)),
  }
  const accentMean = mean(dbs(accentHits))
  const accents: AccentStats = {
    slots: accented.length,
    hits: accentHits.length,
    meanDeltaDb: accentMean !== null && tapMean !== null ? accentMean - tapMean : null,
    belowThreshold:
      tapMean === null ? null : accentHits.filter((j) => (j.hit as Hit).peakDb - tapMean < thresholdDb).length,
    thresholdDb,
  }

  return {
    slots: js.length,
    good: count('good'),
    ok: count('ok'),
    off: count('off'),
    miss: count('miss'),
    pending: count('pending'),
    extras: result.extras.length,
    meanOffsetMs: mean(offsets(js)),
    sdOffsetMs: sd(offsets(js)),
    hands,
    blocks,
    absorbed: result.absorbed.length,
    uniformity,
    accents,
    bpmByRepeat: opts.bpmByRepeat ?? [],
    guide: opts.guide === true,
  }
}
