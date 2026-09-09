import { parseExercise } from '../engine/exercise'
import type { ExerciseJson } from '../engine/types'

const EXERCISES_JSON: ExerciseJson[] = [
  {
    id: 'stone-1',
    name: 'Stick Control #1',
    source: 'Stick Control, p. 5',
    timeSignature: [2, 4],
    steps: 'RL RL | RL RL',
    repeats: 20,
  },
  {
    id: 'stone-3',
    name: 'Stick Control #3',
    source: 'Stick Control, p. 5',
    timeSignature: [2, 4],
    steps: 'RR LL | RR LL',
    repeats: 20,
  },
  {
    id: 'stone-5',
    name: 'Stick Control #5',
    source: 'Stick Control, p. 5',
    timeSignature: [2, 4],
    steps: 'RL RR | LR LL',
    repeats: 20,
  },
  // A reading study, not a technique one: Stone is all eighths in 2/4, so the staff never puts one
  // note value next to a different one. Here two bars go through a quarter, eighths, sixteenths, a
  // triplet and rests — beat, eighth and sixteenth — which is what puts the drawing to the test
  // (broken beams, triplet brackets, different widths inside the same beat) and the reading.
  // The hands alternate on their own; the rests break the alternation, as in music.
  {
    id: 'reading-4-4',
    name: 'Mixed reading',
    source: 'study',
    timeSignature: [4, 4],
    steps: '>R LR LRLR L- | >RLR -L R-LR -',
    repeats: 8,
  },
]

export const EXERCISES = EXERCISES_JSON.map(parseExercise)
