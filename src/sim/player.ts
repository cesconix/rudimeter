import type { Slot } from '../engine/types'
import { gaussian, rngFor } from './rng'

export interface PlayerModel {
  /** systematic lateness (+) or rush (−), ms */
  biasMs: number
  /** timing scatter, ms (standard deviation) */
  sigmaMs: number
  /** probability of skipping a slot */
  missRate: number
  /** probability of one extra stroke after a slot that was played */
  extraRate: number
  /** level of an unaccented stroke, dBFS */
  baseDb: number
  /** level added on an accented slot, dB */
  accentDb: number
  /** level scatter, dB (standard deviation) */
  dbSigma: number
}

export type PlayerPreset = 'steady' | 'human' | 'sloppy'

/** `steady` never misses and earns the auto-increment; `human` is a decent practice; `sloppy` is a bad day. */
export const PLAYER_PRESETS: Record<PlayerPreset, PlayerModel> = {
  steady: { biasMs: 0, sigmaMs: 6, missRate: 0, extraRate: 0, baseDb: -18, accentDb: 8, dbSigma: 1 },
  human: { biasMs: 5, sigmaMs: 15, missRate: 0.03, extraRate: 0.01, baseDb: -18, accentDb: 6, dbSigma: 2.5 },
  sloppy: { biasMs: 12, sigmaMs: 35, missRate: 0.1, extraRate: 0.05, baseDb: -18, accentDb: 3, dbSigma: 4 },
}

export interface Stroke {
  /** seconds, on the same clock as the slots */
  t: number
  peakDb: number
  /** index of the slot this stroke answers; null for an extra */
  slot: number | null
}

/**
 * The strokes for `slots`, deterministic per (seed, slot.index): a slot draws its own miss, timing,
 * level and extra from `rngFor(seed, index)`, in a fixed order, whether or not it is missed. A grid
 * replanned by the auto-increment therefore gives the slots it keeps exactly the strokes they had.
 * An extra only follows a slot that was played, 45–55 % of the step later: with the main stroke
 * closer to the slot, the judge files it as an extra instead of taking it for the stroke.
 */
export function planStrokes(slots: Slot[], model: PlayerModel, seed: number): Stroke[] {
  const out: Stroke[] = []
  for (const slot of slots) {
    const rng = rngFor(seed, slot.index)
    const miss = rng() < model.missRate
    const timing = gaussian(rng)
    const level = gaussian(rng)
    const extra = rng() < model.extraRate
    const extraPos = rng()
    if (miss) continue
    const t = slot.t + (model.biasMs + timing * model.sigmaMs) / 1000
    const peakDb = model.baseDb + (slot.step.accent ? model.accentDb : 0) + level * model.dbSigma
    out.push({ t, peakDb, slot: slot.index })
    if (extra) out.push({ t: slot.t + slot.dur * (0.45 + extraPos * 0.1), peakDb: model.baseDb - 6, slot: null })
  }
  return out.sort((a, b) => a.t - b.t)
}
