import { parseExercise } from '../engine/exercise'
import type { ExerciseJson } from '../engine/types'

/**
 * One row of the pyramid, as two 4/4 bars: `n` beats of sixteenths, the rest eighths. The rule is the
 * exercise — each row adds a quartina to the one before — so the rows are derived from it rather than
 * transcribed by hand thirty times, where a single wrong letter would be invisible. `quartina` is what
 * a beat of sixteenths is played with: singles or doubles. The eighths stay alternating singles in
 * both versions, as on the page.
 */
const pyramidRow = (n: number, quartina: string): string => {
  const beats = Array.from({ length: 8 }, (_, i) => (i < n ? quartina : 'RL'))
  return `${beats.slice(0, 4).join(' ')} | ${beats.slice(4).join(' ')}`
}

/** Up to the longest row and back down, the apex played once: the shape the workout asks for. */
const PYRAMID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1]

const pyramid = (quartina: string): string => PYRAMID_ROWS.map((n) => pyramidRow(n, quartina)).join(' | ')

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
  // A workout, not a pattern: thirty bars that grow a quartina at a time and shrink back, so the hands
  // meet the same sticking fresh and tired. No accents — the point is that the sixteenths arriving one
  // beat later than last row sound like the ones before them. One repeat is already a minute at 120.
  {
    id: 'pyramid-singles',
    name: 'Stroke pyramid — singles',
    source: '50 Workout #3, p. 9',
    timeSignature: [4, 4],
    steps: pyramid('RLRL'),
    repeats: 1,
  },
  {
    id: 'pyramid-doubles',
    name: 'Stroke pyramid — doubles',
    source: '50 Workout #3, p. 9',
    timeSignature: [4, 4],
    steps: pyramid('RRLL'),
    repeats: 1,
  },
]

export const EXERCISES = EXERCISES_JSON.map(parseExercise)
