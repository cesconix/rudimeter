import { barLength, type FlatEvent, flattenVoice, metersOf } from './events'
import { add, eq, type Fraction, ZERO } from './fraction'
import { type Catalogue, resolveInstruments } from './instruments'
import { type Bar, type Event, isTuplet, type Score, type TupletGroup, type Voice } from './types'
import { sections } from './unroll'

export interface Problem {
  path: string
  message: string
}

const BASES = [1, 2, 4, 8, 16, 32]
const ID = /^[a-z0-9-]+$/
const isPow2 = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
const fmt = (f: Fraction): string => (f.den === 1 ? String(f.num) : `${f.num}/${f.den}`)

type Bad = (path: string, message: string) => void

/** Returns false when the duration is unusable: the voice's sum would then be noise, not a second problem. */
function validateEvent(e: Event, path: string, catalogue: Catalogue, bad: Bad): boolean {
  let sound = true
  if (!BASES.includes(e.duration.base)) {
    bad(`${path}.duration.base`, 'must be 1, 2, 4, 8, 16 or 32')
    sound = false
  }
  if (e.duration.dots !== undefined && ![0, 1, 2].includes(e.duration.dots)) {
    bad(`${path}.duration.dots`, 'must be 0, 1 or 2')
    sound = false
  }
  if (e.rest) {
    if (e.notes && e.notes.length > 0) bad(`${path}.notes`, 'a rest has no notes')
    if (e.accent || e.sticking || e.grace || e.roll) bad(path, 'a rest takes no accent, sticking, grace or roll')
    return sound
  }
  if (e.hidden) bad(`${path}.hidden`, 'only a rest can be hidden')
  if (!e.notes || e.notes.length === 0) bad(`${path}.notes`, 'a sounding event needs at least one note')
  const seen = new Set<string>()
  e.notes?.forEach((n, i) => {
    if (!(n.instrument in catalogue)) bad(`${path}.notes[${i}].instrument`, `unknown instrument "${n.instrument}"`)
    else if (seen.has(n.instrument)) bad(`${path}.notes[${i}].instrument`, `"${n.instrument}" twice in one event`)
    seen.add(n.instrument)
    if (n.open && n.closed) bad(`${path}.notes[${i}]`, 'open and closed are exclusive')
  })
  if (e.grace?.instrument !== undefined && !(e.grace.instrument in catalogue))
    bad(`${path}.grace.instrument`, `unknown instrument "${e.grace.instrument}"`)
  if (e.roll?.kind === 'tremolo' && ![1, 2, 3].includes(e.roll.slashes))
    bad(`${path}.roll.slashes`, 'must be 1, 2 or 3')
  return sound
}

/** Structure of one voice: every item and tuplet well formed. Returns false when the sum cannot be trusted. */
function validateItems(voice: Voice, path: string, catalogue: Catalogue, bad: Bad): boolean {
  let sound = true
  voice.items.forEach((item, i) => {
    const p = `${path}.items[${i}]`
    if (isTuplet(item)) {
      const { actual, normal } = item.tuplet
      if (!Number.isInteger(actual) || actual < 1 || !Number.isInteger(normal) || normal < 1) {
        bad(`${p}.tuplet`, 'actual and normal must be positive integers')
        sound = false
      }
      if (item.items.length === 0) bad(`${p}.items`, 'a tuplet needs at least one event')
      item.items.forEach((e, k) => {
        if (isTuplet(e as TupletGroup | Event)) {
          bad(`${p}.items[${k}]`, 'tuplets do not nest')
          sound = false
        } else sound = validateEvent(e, `${p}.items[${k}]`, catalogue, bad) && sound
      })
    } else sound = validateEvent(item, p, catalogue, bad) && sound
  })
  return sound
}

/** Explicit beam marks, when the voice-bar has any: well-nested runs, every beamable event marked, nothing longer than an eighth marked. */
function validateBeams(flat: FlatEvent[], pathOf: (f: FlatEvent) => string, bad: Bad): void {
  if (!flat.some((f) => f.event.beam !== undefined)) return
  /** path of the event that opened the current beam, or null */
  let open: string | null = null
  for (const f of flat) {
    const mark = f.event.beam
    const beamable = f.event.duration.base >= 8 && !f.event.hidden
    if (mark === undefined) {
      if (beamable) bad(`${pathOf(f)}.beam`, 'unmarked while the voice-bar uses explicit beams')
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

export function validate(score: Score, catalogue: Catalogue = resolveInstruments(score)): Problem[] {
  const out: Problem[] = []
  const bad: Bad = (path, message) => out.push({ path, message })

  if (!ID.test(score.id)) bad('id', 'must match [a-z0-9-]+')
  if (score.parts.length === 0) bad('parts', 'at least one part')
  const partIds = new Set<string>()
  score.parts.forEach((p, i) => {
    if (!ID.test(p.id)) bad(`parts[${i}].id`, 'must match [a-z0-9-]+')
    if (partIds.has(p.id)) bad(`parts[${i}].id`, `duplicate part id "${p.id}"`)
    partIds.add(p.id)
  })
  if (score.bars.length === 0) {
    bad('bars', 'at least one bar')
    return out
  }
  if (!score.bars[0].meter) bad('bars[0].meter', 'required on the first bar')
  if (score.bars[0].simile) bad('bars[0].simile', 'the first bar has nothing to repeat')

  const meters = metersOf(score)
  const secs = sections(score)
  let openStart: number | null = null
  // Voices whose items are too malformed for `flattenVoice` to walk (e.g. a nested tuplet, caught
  // and reported by `validateItems` without descending into it) — skipped again below, by the ties
  // and hairpins pass, so that pass never re-flattens structure the first pass already refused to.
  const unsound = new Set<string>()
  // Whether the meter in force is one this bar or an earlier one actually declared and passed the
  // meter check. `metersOf` falls back to 4/4 when a bar has none, which is fine for callers that
  // need a number to work with, but here it would turn one missing meter into a second, fabricated
  // problem (a voice-sum or beams-sum against a bar length nobody wrote). So the sum checks below
  // run only once the meter in force is known good.
  let meterKnown = false

  score.bars.forEach((bar: Bar, b) => {
    const path = `bars[${b}]`
    if (bar.meter) {
      const [num, den] = bar.meter
      if (!Number.isInteger(num) || num < 1 || !isPow2(den) || den > 32) {
        bad(`${path}.meter`, 'numerator a positive integer, denominator 1, 2, 4, 8, 16 or 32')
        meterKnown = false
      } else meterKnown = true
    }
    if (bar.beams && meterKnown) {
      const total = bar.beams.reduce((a, k) => a + k, 0)
      if (bar.beams.some((k) => !Number.isInteger(k) || k < 1) || total !== meters[b][0])
        bad(`${path}.beams`, `positive integers summing to ${meters[b][0]}`)
    }
    if (bar.tempo) {
      if (!(bar.tempo.bpm > 0)) bad(`${path}.tempo.bpm`, 'must be positive')
      if (bar.tempo.unit !== undefined && !BASES.includes(bar.tempo.unit))
        bad(`${path}.tempo.unit`, 'must be 1, 2, 4, 8, 16 or 32')
    }
    if (bar.repeat?.start) {
      if (openStart !== null) bad(`${path}.repeat.start`, 'repeats do not nest')
      openStart = b
    }
    if (bar.repeat?.end) {
      const times = bar.repeat.end.times ?? 2
      if (!Number.isInteger(times) || times < 2) bad(`${path}.repeat.end.times`, 'must be an integer ≥ 2')
      openStart = null
    }
    if (bar.ending) {
      if (bar.ending.length === 0 || bar.ending.some((n) => !Number.isInteger(n) || n < 1))
        bad(`${path}.ending`, 'integers ≥ 1')
      else {
        // Inside a section, or right after one through bars that are all endings (the last ending).
        const inside = secs.find((s) => s.start <= b && b <= s.end)
        const trailing = secs.find((s) => s.end < b && score.bars.slice(s.end + 1, b + 1).every((x) => x.ending))
        const section = inside ?? trailing
        if (!section) bad(`${path}.ending`, 'outside a repeated section')
        else if (bar.ending.some((n) => n > section.times))
          bad(`${path}.ending`, `beyond the section's ${section.times} passes`)
      }
    }
    if (bar.simile) {
      if (bar.parts) bad(`${path}.parts`, 'a simile bar has no parts')
      return
    }
    for (const part of score.parts) {
      const pb = bar.parts?.[part.id]
      const pp = `${path}.parts.${part.id}`
      if (!pb) {
        bad(pp, 'missing')
        continue
      }
      if (pb.voices.length < 1 || pb.voices.length > 2) {
        bad(`${pp}.voices`, '1 or 2 voices')
        continue
      }
      pb.voices.forEach((voice, v) => {
        const vp = `${pp}.voices[${v}]`
        if (!validateItems(voice, vp, catalogue, bad)) {
          unsound.add(`${b}|${part.id}|${v}`)
          return
        }
        const flat = flattenVoice(voice)
        if (meterKnown) {
          const total = flat.reduce((acc, f) => add(acc, f.length), ZERO)
          const expected = barLength(meters[b])
          if (!eq(total, expected)) bad(vp, `sums to ${fmt(total)}, the bar is ${fmt(expected)}`)
        }
        validateBeams(flat, (f) => `${vp}.items[${f.item}]${f.sub === undefined ? '' : `.items[${f.sub}]`}`, bad)
      })
    }
    for (const id of Object.keys(bar.parts ?? {})) if (!partIds.has(id)) bad(`${path}.parts.${id}`, 'unknown part')
  })

  // Ties and hairpins run along a voice, bar after bar: one pass per (part, voice index).
  for (const part of score.parts) {
    for (const v of [0, 1]) {
      const seq: { f: FlatEvent; path: string }[] = []
      score.bars.forEach((bar, b) => {
        const voice = bar.parts?.[part.id]?.voices[v]
        if (!voice || unsound.has(`${b}|${part.id}|${v}`)) return
        const vp = `bars[${b}].parts.${part.id}.voices[${v}]`
        for (const f of flattenVoice(voice))
          seq.push({ f, path: `${vp}.items[${f.item}]${f.sub === undefined ? '' : `.items[${f.sub}]`}` })
      })
      let hairpin: string | null = null
      seq.forEach(({ f, path }, i) => {
        f.event.notes?.forEach((n, k) => {
          if (!n.tie) return
          const next = seq[i + 1]?.f.event
          if (!next || next.rest || !next.notes?.some((m) => m.instrument === n.instrument))
            bad(`${path}.notes[${k}].tie`, 'the next event of the voice does not carry this instrument')
        })
        const h = f.event.hairpin
        if (h === 'stop') {
          if (!hairpin) bad(`${path}.hairpin`, 'stop with no hairpin open')
          hairpin = null
        } else if (h) {
          // A second start is one problem, not two: closing the first here keeps "never stopped" from piling on.
          if (hairpin) {
            bad(`${path}.hairpin`, 'a hairpin is already open')
            hairpin = null
          } else hairpin = path
        }
      })
      if (hairpin) bad(`${hairpin}.hairpin`, 'never stopped')
    }
  }
  return out
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/**
 * The boundary for a score read from JSON: the shape is checked enough to run `validate` without
 * crashing, then every problem is reported at once. A malformed bar deeper than that surfaces as a
 * named error instead of a TypeError from the middle of the checks.
 */
export function parseScore(json: unknown): Score {
  if (
    !isRecord(json) ||
    typeof json.id !== 'string' ||
    typeof json.title !== 'string' ||
    !Array.isArray(json.parts) ||
    !Array.isArray(json.bars)
  )
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
