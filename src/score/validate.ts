import { barLength, type FlatEvent, flattenBar, metersOf } from './events'
import { add, eq, type Fraction, ZERO } from './fraction'
import { type Bar, type BeamMark, type Event, type Item, isTuplet, type Score } from './types'

export interface Problem {
  path: string
  message: string
}

const BASES = [1, 2, 4, 8, 16, 32]
const ID = /^[a-z0-9-]+$/
const isPow2 = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
const fmt = (f: Fraction): string => (f.den === 1 ? String(f.num) : `${f.num}/${f.den}`)
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

type Bad = (path: string, message: string) => void

/**
 * The keys every level of the JSON may carry. Anything else is a problem named by its path: a
 * typo (`stiking`) or a leftover of the kit model (`parts`, `notes`, `hidden`, `tempo`) fails
 * loudly instead of being read as nothing.
 */
const KEYS = {
  score: ['id', 'title', 'source', 'bars'],
  bar: ['meter', 'beams', 'repeat', 'newRow', 'items'],
  repeat: ['start', 'end'],
  end: ['times'],
  event: ['duration', 'rest', 'accent', 'sticking', 'grace', 'roll', 'tie', 'text', 'beam'],
  duration: ['base', 'dots'],
  grace: ['kind'],
  tremolo: ['kind', 'slashes'],
  buzz: ['kind'],
  group: ['tuplet', 'items'],
  tuplet: ['actual', 'normal'],
} as const

const known = (value: object, allowed: readonly string[], path: string, bad: Bad): void => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) bad(path ? `${path}.${key}` : key, 'unknown key')
}

/** A flag is `true` or absent: `false`, `1`, `"yes"` are mistakes, never a way to switch something off. */
const flag = (value: object, key: string, path: string, bad: Bad): void => {
  const v = (value as Record<string, unknown>)[key]
  if (v !== undefined && v !== true) bad(`${path}.${key}`, 'must be true when present')
}

/** Returns false when the duration is unusable: the bar's sum would then be noise, not a second problem. */
function validateEvent(e: Event, path: string, bad: Bad): boolean {
  known(e, KEYS.event, path, bad)
  if (!isRecord(e.duration)) {
    bad(`${path}.duration`, 'required')
    return false
  }
  known(e.duration, KEYS.duration, `${path}.duration`, bad)
  let sound = true
  if (!BASES.includes(e.duration.base)) {
    bad(`${path}.duration.base`, 'must be 1, 2, 4, 8, 16 or 32')
    sound = false
  }
  if (e.duration.dots !== undefined && ![0, 1, 2].includes(e.duration.dots)) {
    bad(`${path}.duration.dots`, 'must be 0, 1 or 2')
    sound = false
  }
  for (const k of ['rest', 'accent', 'tie']) flag(e, k, path, bad)
  if (e.sticking !== undefined && e.sticking !== 'R' && e.sticking !== 'L') bad(`${path}.sticking`, 'must be R or L')
  if (e.grace !== undefined) {
    if (!isRecord(e.grace)) bad(`${path}.grace`, 'must be an object')
    else {
      known(e.grace, KEYS.grace, `${path}.grace`, bad)
      if (e.grace.kind !== 'flam' && e.grace.kind !== 'drag') bad(`${path}.grace.kind`, 'must be flam or drag')
    }
  }
  if (e.roll !== undefined) {
    if (!isRecord(e.roll)) bad(`${path}.roll`, 'must be an object')
    else if (e.roll.kind === 'tremolo') {
      known(e.roll, KEYS.tremolo, `${path}.roll`, bad)
      if (![1, 2, 3].includes(e.roll.slashes)) bad(`${path}.roll.slashes`, 'must be 1, 2 or 3')
    } else if (e.roll.kind === 'buzz') known(e.roll, KEYS.buzz, `${path}.roll`, bad)
    else bad(`${path}.roll.kind`, 'must be tremolo or buzz')
  }
  if (e.beam !== undefined && !['begin', 'continue', 'end'].includes(e.beam))
    bad(`${path}.beam`, 'must be begin, continue or end')
  if (e.text !== undefined && typeof e.text !== 'string') bad(`${path}.text`, 'must be a string')
  // A label over a rest is print ("Fill" over an empty beat); everything else on the list is a stroke's.
  if (e.rest && (e.accent || e.sticking || e.grace || e.roll || e.tie))
    bad(path, 'a rest takes no accent, sticking, grace, roll or tie')
  return sound
}

/** Structure of a bar's items: every event and tuplet well formed. Returns false when the sum cannot be trusted. */
function validateItems(items: Item[], path: string, bad: Bad): boolean {
  let sound = true
  items.forEach((item, i) => {
    const p = `${path}.items[${i}]`
    if (!isTuplet(item)) {
      sound = validateEvent(item, p, bad) && sound
      return
    }
    known(item, KEYS.group, p, bad)
    if (!isRecord(item.tuplet)) {
      bad(`${p}.tuplet`, 'must be an object')
      sound = false
    } else {
      known(item.tuplet, KEYS.tuplet, `${p}.tuplet`, bad)
      const { actual, normal } = item.tuplet
      if (!Number.isInteger(actual) || actual < 1 || !Number.isInteger(normal) || normal < 1) {
        bad(`${p}.tuplet`, 'actual and normal must be positive integers')
        sound = false
      }
    }
    if (!Array.isArray(item.items) || item.items.length === 0) {
      // The bar's sum is short by whatever the group was meant to hold: one mistake, one path.
      bad(`${p}.items`, 'a tuplet needs at least one event')
      sound = false
      return
    }
    item.items.forEach((e, k) => {
      if (isTuplet(e as Item)) {
        bad(`${p}.items[${k}]`, 'tuplets do not nest')
        sound = false
      } else sound = validateEvent(e, `${p}.items[${k}]`, bad) && sound
    })
  })
  return sound
}

/** A well-formed mark. An invalid value is reported once, by `validateEvent`, and read here as no mark at all, so it never switches the bar to explicit mode. */
const isMark = (b: unknown): b is BeamMark => b === 'begin' || b === 'continue' || b === 'end'

/** Explicit beam marks, when the bar has any: well-nested runs, every beamable event marked, nothing longer than an eighth marked. */
function validateBeams(flat: FlatEvent[], pathOf: (f: FlatEvent) => string, bad: Bad): void {
  if (!flat.some((f) => isMark(f.event.beam))) return
  /** path of the event that opened the current beam, or null */
  let open: string | null = null
  for (const f of flat) {
    const mark = isMark(f.event.beam) ? f.event.beam : undefined
    const beamable = f.event.duration.base >= 8
    if (mark === undefined) {
      if (beamable) bad(`${pathOf(f)}.beam`, 'unmarked while the bar uses explicit beams')
      continue
    }
    if (!beamable) {
      bad(`${pathOf(f)}.beam`, 'only an eighth or shorter can carry a beam')
      continue
    }
    if (mark === 'begin') {
      if (open) bad(`${pathOf(f)}.beam`, 'begin inside an open beam')
      open = pathOf(f)
    } else {
      if (!open) bad(`${pathOf(f)}.beam`, `${mark} with no beam open`)
      if (mark === 'end') open = null
    }
  }
  if (open) bad(`${open}.beam`, 'never ended')
}

const pathOf = (bar: string, f: FlatEvent): string =>
  `${bar}.items[${f.item}]${f.sub === undefined ? '' : `.items[${f.sub}]`}`

export function validate(score: Score): Problem[] {
  const out: Problem[] = []
  const bad: Bad = (path, message) => out.push({ path, message })

  known(score, KEYS.score, '', bad)
  if (typeof score.id !== 'string' || !ID.test(score.id)) bad('id', 'must match [a-z0-9-]+')
  if (score.source !== undefined && typeof score.source !== 'string') bad('source', 'must be a string')
  if (!Array.isArray(score.bars) || score.bars.length === 0) {
    bad('bars', 'at least one bar')
    return out
  }
  if (!score.bars[0].meter) bad('bars[0].meter', 'required on the first bar')

  const meters = metersOf(score)
  let openStart: number | null = null
  // Bars whose items are too malformed for `flattenBar` to walk (a nested tuplet, say, reported by
  // `validateItems` without descending into it) — skipped again below, by the ties pass, so that
  // pass never re-flattens structure the first pass already refused to.
  const unsound = new Set<number>()
  // Whether the meter in force is one this bar or an earlier one actually declared and passed the
  // meter check. `metersOf` falls back to 4/4 when a bar has none, which is fine for callers that
  // need a number to work with, but here it would turn one missing meter into a second, fabricated
  // problem (a sum or a beams total against a bar length nobody wrote). So the sum checks below
  // run only once the meter in force is known good.
  let meterKnown = false

  score.bars.forEach((bar: Bar, b) => {
    const path = `bars[${b}]`
    known(bar, KEYS.bar, path, bad)
    if (bar.meter !== undefined) {
      const [num, den] = Array.isArray(bar.meter) ? bar.meter : [Number.NaN, Number.NaN]
      if (!Number.isInteger(num) || num < 1 || !isPow2(den) || den > 32) {
        bad(`${path}.meter`, 'numerator a positive integer, denominator 1, 2, 4, 8, 16 or 32')
        meterKnown = false
      } else meterKnown = true
    }
    if (bar.beams !== undefined && meterKnown) {
      const ok = Array.isArray(bar.beams) && bar.beams.every((k) => Number.isInteger(k) && k >= 1)
      const total = ok ? bar.beams.reduce((a, k) => a + k, 0) : Number.NaN
      if (total !== meters[b][0]) bad(`${path}.beams`, `positive integers summing to ${meters[b][0]}`)
    }
    flag(bar, 'newRow', path, bad)
    if (bar.repeat !== undefined) {
      if (!isRecord(bar.repeat)) bad(`${path}.repeat`, 'must be an object')
      else {
        known(bar.repeat, KEYS.repeat, `${path}.repeat`, bad)
        flag(bar.repeat, 'start', `${path}.repeat`, bad)
        if (bar.repeat.start) {
          if (openStart !== null) bad(`${path}.repeat.start`, 'repeats do not nest')
          openStart = b
        }
        if (bar.repeat.end !== undefined) {
          if (!isRecord(bar.repeat.end)) bad(`${path}.repeat.end`, 'must be an object')
          else {
            known(bar.repeat.end, KEYS.end, `${path}.repeat.end`, bad)
            const times = bar.repeat.end.times ?? 2
            if (!Number.isInteger(times) || times < 2) bad(`${path}.repeat.end.times`, 'must be an integer ≥ 2')
          }
          openStart = null
        }
      }
    }
    if (!Array.isArray(bar.items)) {
      bad(`${path}.items`, 'required')
      unsound.add(b)
      return
    }
    if (!validateItems(bar.items, path, bad)) {
      unsound.add(b)
      return
    }
    const flat = flattenBar(bar)
    if (meterKnown) {
      const total = flat.reduce((acc, f) => add(acc, f.length), ZERO)
      const expected = barLength(meters[b])
      if (!eq(total, expected)) bad(`${path}.items`, `sums to ${fmt(total)}, the bar is ${fmt(expected)}`)
    }
    validateBeams(flat, (f) => pathOf(path, f), bad)
  })

  // A tie reaches the next event of the piece in written order, across the barline, and that
  // event must be a stroke: a tie into a rest, or off the end of the piece, holds nothing.
  const seq: { event: Event; path: string }[] = []
  score.bars.forEach((bar, b) => {
    if (unsound.has(b)) return
    for (const f of flattenBar(bar)) seq.push({ event: f.event, path: pathOf(`bars[${b}]`, f) })
  })
  seq.forEach(({ event, path }, i) => {
    if (!event.tie) return
    const next = seq[i + 1]?.event
    if (!next) bad(`${path}.tie`, 'the last event of the piece has nothing to tie to')
    else if (next.rest) bad(`${path}.tie`, 'tied into a rest')
  })
  return out
}

/**
 * The boundary for a score read from JSON: the shape is checked enough to run `validate` without
 * crashing, then every problem is reported at once. A malformed bar deeper than that surfaces as a
 * named error instead of a TypeError from the middle of the checks.
 */
export function parseScore(json: unknown): Score {
  if (!isRecord(json) || typeof json.id !== 'string' || typeof json.title !== 'string' || !Array.isArray(json.bars))
    throw new Error('not a score object')
  const score = json as unknown as Score
  let problems: Problem[]
  try {
    problems = validate(score)
  } catch (err) {
    throw new Error(`${score.id}: malformed score (${err instanceof Error ? err.message : String(err)})`)
  }
  if (problems.length > 0) throw new Error(`${score.id}: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`)
  return score
}
