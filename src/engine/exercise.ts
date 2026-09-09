import { parseSticking } from './dsl'
import type { Exercise, ExerciseJson, Step } from './types'

export function parseExercise(json: ExerciseJson): Exercise {
  const [num, den] = json.timeSignature
  if (den !== 4 || !Number.isInteger(num) || num < 1) throw new Error(`${json.id}: only x/4 time signatures in v1`)
  const bars = parseSticking(json.steps, num)
  const flat = bars.flatMap((b) => b.beats.flatMap((bt) => bt.steps))
  if (!flat.some((s) => s.hand !== null)) throw new Error(`${json.id}: rests only`)
  const repeats = json.repeats ?? 20
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`${json.id}: invalid repeats`)
  return {
    id: json.id,
    name: json.name,
    source: json.source,
    timeSignature: json.timeSignature,
    sticking: json.steps,
    bars,
    repeats,
  }
}

export interface FlatStep {
  step: Step
  bar: number
  beat: number
  sub: number
  /** notes in the beat (= subdivision) */
  n: number
  /** position within the repeat, rests included */
  ordinal: number
}

/** The steps in bar → beat → note order, rests included. */
export function stepsFlat(ex: Exercise): FlatStep[] {
  const out: FlatStep[] = []
  ex.bars.forEach((bar, b) => {
    bar.beats.forEach((bt, k) => {
      bt.steps.forEach((step, i) => {
        out.push({ step, bar: b, beat: k, sub: i, n: bt.steps.length, ordinal: out.length })
      })
    })
  })
  return out
}

export const barsOf = (ex: Exercise): number => ex.bars.length

/** Slots (steps with a hand) in one repeat. */
export const slotsPerRepeat = (ex: Exercise): number => stepsFlat(ex).filter((f) => f.step.hand !== null).length
