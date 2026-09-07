import { parseExercise } from '../engine/exercise'
import type { ExerciseJson } from '../engine/types'

export const EXERCISES_JSON: ExerciseJson[] = [
  { id: 'stone-1', name: 'Stick Control #1', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 20 },
  { id: 'stone-3', name: 'Stick Control #3', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RR LL | RR LL', repeats: 20 },
  { id: 'stone-5', name: 'Stick Control #5', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RL RR | LR LL', repeats: 20 },
]

export const EXERCISES = EXERCISES_JSON.map(parseExercise)
