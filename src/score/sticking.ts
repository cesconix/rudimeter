import { parseSticking } from '../engine/dsl'
import type { ExerciseJson, Step } from '../engine/types'
import type { Bar, Duration, Event, Item, NoteBase, Score } from './types'

/**
 * A beat split into n equal steps, written out: the same table as notation/plan's DURATION and
 * OCCUPIED, so the compiled score draws exactly what the DSL renderer drew.
 */
const SUBDIVISION: Record<number, { base: NoteBase; tuplet?: { actual: number; normal: number } }> = {
  1: { base: 4 },
  2: { base: 8 },
  4: { base: 16 },
  8: { base: 32 },
  3: { base: 8, tuplet: { actual: 3, normal: 2 } },
  5: { base: 16, tuplet: { actual: 5, normal: 4 } },
  6: { base: 16, tuplet: { actual: 6, normal: 4 } },
  7: { base: 16, tuplet: { actual: 7, normal: 4 } },
}

/**
 * The DSL's grace hand — the `(L)` of `f(L)R` — is parsed by `parseToken` and stops here: books
 * mark a flam's hand on the main note only, and the score never printed it.
 */
function eventOf(step: Step, duration: Duration): Event {
  if (step.hand === null) return { duration, rest: true }
  const e: Event = { duration }
  if (step.accent) e.accent = true
  e.sticking = step.hand
  if (step.ornament === 'flam' || step.ornament === 'drag') e.grace = { kind: step.ornament }
  if (step.ornament === 'buzz') e.roll = { kind: 'buzz' }
  if (step.ornament === 'tremolo') e.roll = { kind: 'tremolo', slashes: 1 }
  return e
}

/** The sticking DSL as a score on the snare. Same checks as `parseExercise`, so the two libraries agree on what is valid. */
export function fromSticking(json: ExerciseJson): Score {
  const [num, den] = json.timeSignature
  if (den !== 4 || !Number.isInteger(num) || num < 1) throw new Error(`${json.id}: only x/4 time signatures`)
  const repeats = json.repeats ?? 20
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`${json.id}: invalid repeats`)
  const parsed = parseSticking(json.steps, num)
  const bars: Bar[] = parsed.map((bar, b) => {
    const items: Item[] = bar.beats.flatMap((beat) => {
      const spec = SUBDIVISION[beat.steps.length]
      if (!spec) throw new Error(`${json.id}: bar ${b + 1}: ${beat.steps.length} notes in a beat`)
      const events = beat.steps.map((s) => eventOf(s, { base: spec.base }))
      // Contextually typed as Item[] so the ternary's two branches (a single tuplet group vs. several
      // events) unify: TS does not merge `TupletGroup[] | Event[]` into `Item[]` on its own.
      const group: Item[] = spec.tuplet ? [{ tuplet: spec.tuplet, items: events }] : events
      return group
    })
    // Keys in reading order — meter, repeat, items — because this object is what the JSON files are generated from.
    const head: Omit<Bar, 'items'> = {}
    if (b === 0) head.meter = json.timeSignature
    if (repeats > 1) {
      if (b === 0) head.repeat = { start: true }
      if (b === parsed.length - 1) head.repeat = { ...head.repeat, end: { times: repeats } }
    }
    return { ...head, items }
  })
  // Keys in the order the hand-written JSON files use, so a compiled score reads like one of them.
  return {
    id: json.id,
    title: json.name,
    ...(json.source ? { source: json.source } : {}),
    bars,
  }
}
