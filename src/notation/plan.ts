import { slotsPerRepeat } from '../engine/exercise'
import type { Exercise, Hand, Ornament, Step } from '../engine/types'

export type Duration = 'q' | '8' | '16' | '32'

export interface NotePlan {
  rest: boolean
  duration: Duration
  accent: boolean
  sticking: Hand | null
  /** grace notes before the note: [] none, 1 = flam, 2 = drag */
  grace: Hand[]
  ornament: Ornament | null
  /** index of the slot in the grid; null for rests */
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

/** VexFlow duration of a note in a beat split into `n`. */
export function durationFor(n: number): Duration {
  const d = DURATION[n]
  if (!d) throw new Error(`subdivision ${n} not supported`)
  return d
}

/** Tuplet for `n` notes in the beat, or null if regular. */
export function tupletFor(n: number): { numNotes: number; notesOccupied: number } | null {
  const occupied = OCCUPIED[n]
  return occupied ? { numNotes: n, notesOccupied: occupied } : null
}

const opposite = (h: Hand): Hand => (h === 'R' ? 'L' : 'R')

export function graceHands(step: Step): Hand[] {
  if (!step.hand) return []
  const grace = step.graceHand ?? opposite(step.hand)
  if (step.ornament === 'flam') return [grace]
  if (step.ornament === 'drag') return [grace, grace]
  return []
}

/** Plan of a repeat; the slotIndex values continue from `slotOffset` in the same order as buildRepeat. */
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
          if (step.hand === null)
            return { rest: true, duration, accent: false, sticking: null, grace: [], ornament: null, slotIndex: null }
          return {
            rest: false,
            duration,
            accent: step.accent,
            sticking: step.hand,
            grace: graceHands(step),
            ornament: step.ornament ?? null,
            slotIndex: next++,
          }
        }),
      }
    }),
  }))
}

/** All the repeats unrolled, one after another. */
export function planExercise(ex: Exercise): BarPlan[] {
  const per = slotsPerRepeat(ex)
  const out: BarPlan[] = []
  for (let r = 0; r < ex.repeats; r++) out.push(...planRepeat(ex, r, r * per))
  return out
}
