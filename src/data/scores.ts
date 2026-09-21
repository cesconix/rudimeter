import { fromSticking } from '../score/sticking'
import type { Score } from '../score/types'
import { parseScore } from '../score/validate'
import { EXERCISES_JSON } from './exercises'
import pyramidDoubles from './scores/pyramid-doubles.json'
import pyramidSingles from './scores/pyramid-singles.json'
import workout43 from './scores/workout-43.json'

/**
 * The library: the sticking exercises compiled, then the pieces written as JSON. `parseScore` is
 * the boundary — a JSON that does not validate throws here, at import time, and never reaches a
 * screen; `scores.test.ts` runs the same check so the failure shows up in the gate first.
 */
export const SCORES: Score[] = [
  ...EXERCISES_JSON.map(fromSticking),
  ...[pyramidSingles, pyramidDoubles, workout43].map(parseScore),
]
