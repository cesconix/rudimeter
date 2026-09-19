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
 */
export function resolveBeams(meter: Meter, beams: number[] | undefined, flat: FlatEvent[]): (BeamMark | null)[] {
  if (flat.some((f) => f.event.beam !== undefined)) return flat.map((f) => f.event.beam ?? null)
  const marks: (BeamMark | null)[] = flat.map(() => null)
  let start = ZERO
  for (const group of beamGroups(meter, beams)) {
    const end = add(start, group)
    const inside = flat.map((_f, i) => i).filter((i) => cmp(flat[i].offset, start) >= 0 && cmp(flat[i].offset, end) < 0)

    // Split the group at every event that cannot carry a beam; each run is beamed on its own.
    const runs: number[][] = []
    let run: number[] = []
    for (const i of inside) {
      if (beamable(flat[i])) {
        run.push(i)
      } else {
        if (run.length) runs.push(run)
        run = []
      }
    }
    if (run.length) runs.push(run)

    for (const r of runs) {
      let a = 0
      let b = r.length - 1
      while (a <= b && flat[r[a]].event.rest) a++
      while (b >= a && flat[r[b]].event.rest) b--
      const trimmed = r.slice(a, b + 1)
      if (trimmed.filter((i) => !flat[i].event.rest).length >= 2) {
        trimmed.forEach((i, k) => {
          marks[i] = k === 0 ? 'begin' : k === trimmed.length - 1 ? 'end' : 'continue'
        })
      }
    }
    start = end
  }
  return marks
}
