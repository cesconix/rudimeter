import { parseExercise } from '../engine/exercise'
import type { ExerciseJson } from '../engine/types'

export const EXERCISES_JSON: ExerciseJson[] = [
  { id: 'stone-1', name: 'Stick Control #1', source: 'Stick Control, p. 5', timeSignature: [2, 4], subdivision: 8, steps: 'RLRL RLRL', repeats: 20 },
  { id: 'stone-3', name: 'Stick Control #3', source: 'Stick Control, p. 5', timeSignature: [2, 4], subdivision: 8, steps: 'RRLL RRLL', repeats: 20 },
  { id: 'stone-5', name: 'Stick Control #5', source: 'Stick Control, p. 5', timeSignature: [2, 4], subdivision: 8, steps: 'RLRR LRLL', repeats: 20 },
]

export const EXERCISES = EXERCISES_JSON.map(parseExercise)
