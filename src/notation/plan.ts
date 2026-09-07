import { slotsPerRepeat } from '../engine/exercise'
import type { Exercise, Hand, Ornament, Step } from '../engine/types'

export type Duration = 'q' | '8' | '16' | '32'

export interface NotePlan {
  rest: boolean
  duration: Duration
  accent: boolean
  sticking: Hand | null
  /** acciaccature prima della nota: [] nessuna, 1 = flam, 2 = drag */
  grace: Hand[]
  ornament: Ornament | null
  /** indice dello slot nella griglia; null per le pause */
  slotIndex: number | null
}

export interface BeatPlan {
  notes: NotePlan[]
  tuplet: { numNotes: number; notesOccupied: number } | null
}

export interface BarPlan {
  repeat: number
  bar: number
  beats: BeatPlan[]
}

const DURATION: Record<number, Duration> = { 1: 'q', 2: '8', 3: '8', 4: '16', 5: '16', 6: '16', 7: '16', 8: '32' }
const OCCUPIED: Record<number, number> = { 3: 2, 5: 4, 6: 4, 7: 4 }

/** Durata VexFlow di una figura in un movimento diviso in `n`. */
export function durationFor(n: number): Duration {
  const d = DURATION[n]
  if (!d) throw new Error(`suddivisione ${n} non supportata`)
  return d
}

/** Gruppo irregolare per `n` figure nel movimento, o null se regolare. */
export function tupletFor(n: number): { numNotes: number; notesOccupied: number } | null {
  const occupied = OCCUPIED[n]
  return occupied ? { numNotes: n, notesOccupied: occupied } : null
}

export function graceHands(step: Step): Hand[] {
  if (step.ornament === 'flam') return [step.graceHand ?? 'L']
  if (step.ornament === 'drag') return [step.graceHand ?? 'L', step.graceHand ?? 'L']
  return []
}

/** Piano di una ripetizione; gli slotIndex continuano da `slotOffset` nello stesso ordine di buildRepeat. */
export function planRepeat(ex: Exercise, repeat: number, slotOffset: number): BarPlan[] {
  let next = slotOffset
  return ex.bars.map((bar, b) => ({
    repeat,
    bar: b,
    beats: bar.beats.map((bt) => {
      const n = bt.steps.length
      const duration = durationFor(n)
      return {
        tuplet: tupletFor(n),
        notes: bt.steps.map((step): NotePlan => {
          if (step.hand === null) return { rest: true, duration, accent: false, sticking: null, grace: [], ornament: null, slotIndex: null }
          return { rest: false, duration, accent: step.accent, sticking: step.hand, grace: graceHands(step), ornament: step.ornament ?? null, slotIndex: next++ }
        }),
      }
    }),
  }))
}

/** Tutte le ripetizioni srotolate, una dopo l'altra. */
export function planExercise(ex: Exercise): BarPlan[] {
  const per = slotsPerRepeat(ex)
  const out: BarPlan[] = []
  for (let r = 0; r < ex.repeats; r++) out.push(...planRepeat(ex, r, r * per))
  return out
}
