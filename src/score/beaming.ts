import type { FlatEvent } from './events'
import { add, cmp, type Fraction, frac, ZERO } from './fraction'
import type { BeamMark, Meter } from './types'

/** Lengths of the beaming groups of a bar, whole-note units. */
export function beamGroups(meter: Meter, beams?: number[]): Fraction[] {
  const [num, den] = meter
  const times = (k: number) => frac(k, den)
  if (beams) return beams.map(times)
  if (den <= 4) return Array.from({ length: num }, () => times(1))
  if (num % 3 === 0) return Array.from({ length: num / 3 }, () => times(3))
  // 7/8 → 2+2+3, 5/8 → 2+3: the odd remainder goes on the last group, as drum books print it.
  const out: Fraction[] = []
  let left = num
  while (left > 0) {
    const k = left === 3 ? 3 : left === 1 ? 1 : 2
    out.push(times(k))
    left -= k
  }
  return out
}

/** Eighths and shorter can carry a beam; a hidden rest takes time but draws nothing, so it cannot. */
const beamable = (f: FlatEvent): boolean => f.event.duration.base >= 8 && !f.event.hidden

/**
 * A beam mark for every flat event of a voice-bar. Explicit marks on any event switch the whole
 * voice-bar to explicit mode (the importer writes them all); otherwise the groups come from the
 * meter. Inside a group, a rest at either edge stays outside the beam and a rest in the middle is
 * beamed over — what today's renderer does, and what keeps the beat readable. A hidden rest or a
 * note too long to carry a beam splits the group into runs instead of just trimming: it draws
 * nothing (or nothing short), so a beam crossing it would join notes across a gap the other voice
 * fills, or a note that was never eligible in the first place.
 *
 * A tuplet is a run of its own, whole, whatever the beat groups say: the bracket already reads as
 * one unit, so cutting it on a beat line — or letting its notes beam to the neighbours outside it —
 * would draw a group the music does not have. Its items are beamed together only when every one of
 * them could carry a beam; one quarter inside (a quarter-note triplet) leaves the whole group
 * unbeamed rather than half beamed.
 */
export function resolveBeams(meter: Meter, beams: number[] | undefined, flat: FlatEvent[]): (BeamMark | null)[] {
  if (flat.some((f) => f.event.beam !== undefined)) return flat.map((f) => f.event.beam ?? null)
  const marks: (BeamMark | null)[] = flat.map(() => null)

  // The end offset of every beat group; `groupOf` is the index of the group an offset falls in, −1
  // past the last one (a voice that overflows the bar — validation reports it — beams nothing there).
  const ends: Fraction[] = []
  let edge = ZERO
  for (const group of beamGroups(meter, beams)) {
    edge = add(edge, group)
    ends.push(edge)
  }
  const groupOf = (offset: Fraction): number => ends.findIndex((e) => cmp(offset, e) < 0)

  const runs: number[][] = []
  let run: number[] = []
  const close = () => {
    if (run.length) runs.push(run)
    run = []
  }
  // −2 is "no group open": it matches neither a group index nor the −1 of an overflowing event.
  let group = -2
  let i = 0
  while (i < flat.length) {
    const f = flat[i]
    if (f.tuplet) {
      close()
      let j = i
      while (j < flat.length && flat[j].tuplet === f.tuplet) j++
      const items = Array.from({ length: j - i }, (_x, k) => i + k)
      if (items.every((k) => beamable(flat[k]))) runs.push(items)
      group = -2
      i = j
      continue
    }
    const g = groupOf(f.offset)
    if (g !== group) {
      close()
      group = g
    }
    if (g >= 0 && beamable(f)) run.push(i)
    else close()
    i++
  }
  close()

  for (const r of runs) {
    let a = 0
    let b = r.length - 1
    while (a <= b && flat[r[a]].event.rest) a++
    while (b >= a && flat[r[b]].event.rest) b--
    const trimmed = r.slice(a, b + 1)
    if (trimmed.filter((k) => !flat[k].event.rest).length >= 2) {
      trimmed.forEach((k, pos) => {
        marks[k] = pos === 0 ? 'begin' : pos === trimmed.length - 1 ? 'end' : 'continue'
      })
    }
  }
  return marks
}
