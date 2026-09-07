import type { Exercise, Slot } from './types'
import { barsOf, stepsPerBar, subdivisionValue } from './exercise'

export function beatDuration(bpm: number): number {
  return 60 / bpm
}

/** Durata di uno step in secondi. Il bpm è riferito alla figura al denominatore. */
export function stepDuration(exercise: Exercise, bpm: number): number {
  const [, den] = exercise.timeSignature
  return (beatDuration(bpm) * den) / subdivisionValue(exercise.subdivision)
}

export function barDuration(exercise: Exercise, bpm: number): number {
  return exercise.timeSignature[0] * beatDuration(bpm)
}

export interface GridOptions {
  countInBars: number
}

export interface Grid {
  t0: number
  countInEnd: number
  end: number
  slots: Slot[]
  /** un click per beat, count-in incluso */
  clickTimes: number[]
  countInClicks: number
  stepDur: number
}

export function buildGrid(exercise: Exercise, bpm: number, t0: number, opts: GridOptions = { countInBars: 1 }): Grid {
  const [num] = exercise.timeSignature
  const beat = beatDuration(bpm)
  const stepDur = stepDuration(exercise, bpm)
  const perBar = stepsPerBar(exercise.timeSignature, exercise.subdivision)
  const bars = barsOf(exercise)
  const countInEnd = t0 + opts.countInBars * barDuration(exercise, bpm)

  const slots: Slot[] = []
  for (let r = 0; r < exercise.repeats; r++) {
    exercise.steps.forEach((step, i) => {
      if (step.hand === null) return
      const k = r * exercise.steps.length + i
      slots.push({ index: slots.length, t: countInEnd + k * stepDur, step, repeat: r, bar: Math.floor(i / perBar), stepIndex: i })
    })
  }

  const totalBeats = num * (opts.countInBars + bars * exercise.repeats)
  const clickTimes = Array.from({ length: totalBeats }, (_, b) => t0 + b * beat)
  return { t0, countInEnd, end: t0 + totalBeats * beat, slots, clickTimes, countInClicks: num * opts.countInBars, stepDur }
}

/**
 * Ripetizione e step "in corso" a un dato istante, per la UI live.
 * Prima del count-in: repeat 0, currentStep -1 (nulla evidenziato).
 * A sessione conclusa (parametro `done`, o istante oltre l'ultimo step): repeat clampato
 * all'ultima ripetizione, currentStep -1 — nessuno step resta evidenziato a fine sessione.
 */
export function gridPosition(
  grid: Grid,
  now: number,
  stepsTotal: number,
  repeats: number,
  done: boolean,
): { repeat: number; currentStep: number } {
  const k = Math.floor((now - grid.countInEnd) / grid.stepDur)
  if (k < 0) return { repeat: 0, currentStep: -1 }
  const total = stepsTotal * repeats
  if (done || k >= total) return { repeat: repeats - 1, currentStep: -1 }
  return { repeat: Math.min(Math.floor(k / stepsTotal), repeats - 1), currentStep: k % stepsTotal }
}
