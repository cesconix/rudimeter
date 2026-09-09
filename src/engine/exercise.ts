import { parseSticking } from './dsl'
import type { Exercise, ExerciseJson, Step } from './types'

export function parseExercise(json: ExerciseJson): Exercise {
  const [num, den] = json.timeSignature
  if (den !== 4 || !Number.isInteger(num) || num < 1) throw new Error(`${json.id}: in v1 solo tempi x/4`)
  const bars = parseSticking(json.steps, num)
  const flat = bars.flatMap((b) => b.beats.flatMap((bt) => bt.steps))
  if (!flat.some((s) => s.hand !== null)) throw new Error(`${json.id}: solo pause`)
  const repeats = json.repeats ?? 20
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`${json.id}: repeats non valido`)
  return { id: json.id, name: json.name, source: json.source, timeSignature: json.timeSignature, sticking: json.steps, bars, repeats }
}

export interface FlatStep {
  step: Step
  bar: number
  beat: number
  sub: number
  /** figure nel movimento (= suddivisione) */
  n: number
  /** posizione nella ripetizione, pause incluse */
  ordinal: number
}

/** Gli step in ordine battuta → movimento → figura, pause incluse. */
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

/** Slot (step con mano) in una ripetizione. */
export const slotsPerRepeat = (ex: Exercise): number => stepsFlat(ex).filter((f) => f.step.hand !== null).length
