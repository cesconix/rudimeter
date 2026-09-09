import type { Grade, Hit, Judged, JudgeResult, Slot, Windows } from './types'
import { DEFAULT_WINDOWS } from './types'

export interface JudgeOptions {
  windows?: Windows
  /** tempo corrente: gli slot con finestra ancora aperta restano 'pending' */
  now?: number
}

function gradeOf(offsetMs: number, w: Windows): Grade {
  const a = Math.abs(offsetMs)
  if (a <= w.goodMs) return 'good'
  if (a <= w.okMs) return 'ok'
  return 'off'
}

/** Arrotonda al microsecondo: evita che 1.02 − 1 dia 20.000000000000018 ms. */
function offsetMs(hit: Hit, slot: Slot): number {
  return Math.round((hit.t - slot.t) * 1e6) / 1000
}

/** `slots` ordinati per t (lo sono per costruzione: buildGrid). */
function nearestSlot(slots: Slot[], t: number): Slot | null {
  if (slots.length === 0) return null
  let lo = 0
  let hi = slots.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (slots[mid].t < t) lo = mid + 1
    else hi = mid
  }
  const after = slots[lo]
  const before = slots[lo - 1]
  if (before && Math.abs(before.t - t) <= Math.abs(after.t - t)) return before
  return after
}

export function judge(slots: Slot[], hits: Hit[], opts: JudgeOptions = {}): JudgeResult {
  const w = opts.windows ?? DEFAULT_WINDOWS
  const best = new Map<number, Hit>()
  const extras: Hit[] = []

  for (const hit of hits) {
    const slot = nearestSlot(slots, hit.t)
    if (!slot || Math.abs(hit.t - slot.t) > slot.dur / 2) {
      extras.push(hit)
      continue
    }
    const cur = best.get(slot.index)
    if (!cur) {
      best.set(slot.index, hit)
    } else if (Math.abs(hit.t - slot.t) < Math.abs(cur.t - slot.t)) {
      extras.push(cur)
      best.set(slot.index, hit)
    } else {
      extras.push(hit)
    }
  }

  const judged: Judged[] = slots.map((slot) => {
    const hit = best.get(slot.index) ?? null
    if (hit) {
      const o = offsetMs(hit, slot)
      return { slot, hit, offsetMs: o, grade: gradeOf(o, w) }
    }
    const pending = opts.now !== undefined && slot.t + slot.dur / 2 > opts.now
    return { slot, hit: null, offsetMs: null, grade: pending ? 'pending' : 'miss' }
  })

  const claimed = new Set(best.keys())
  extras.sort((a, b) => a.t - b.t)
  const absorbed = extras.filter((h) => isAbsorbed(slots, h, claimed))
  return { judged, extras: extras.filter((h) => !isAbsorbed(slots, h, claimed)), absorbed }
}

/** Un extra fino a 60 ms prima di uno slot flam/drag è l'acciaccatura. */
const ABSORB_BEFORE_S = 0.06

/** Primo slot con t > x, o undefined. `slots` ordinati per t. */
function firstAfter(slots: Slot[], x: number): Slot | undefined {
  let lo = 0
  let hi = slots.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (slots[mid].t <= x) lo = mid + 1
    else hi = mid
  }
  return slots[lo]
}

/** Ultimo slot con t ≤ x, o undefined. */
function lastAtOrBefore(slots: Slot[], x: number): Slot | undefined {
  let lo = 0
  let hi = slots.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (slots[mid].t <= x) lo = mid + 1
    else hi = mid
  }
  return slots[lo - 1]
}

/**
 * Un extra è assorbito se è l'acciaccatura di un flam/drag imminente o un rimbalzo dentro un buzz/tremolo in corso.
 * `claimed` = indici degli slot che hanno un colpo principale assegnato (vedi `judge`): un'acciaccatura senza il
 * colpo principale non è un'acciaccatura, quindi l'assorbimento vale solo se lo slot ornamentato è stato assegnato.
 * Per flam/drag c'è una condizione in più: lo slot subito prima di quello ornamentato non deve essere un miss.
 * Un colpo tardivo che sfugge alla finestra dello slot precedente e un'acciaccatura anticipata occupano lo stesso
 * intervallo di tempo — nessuna geometria li distingue. Ciò che li distingue è se lo slot precedente ha bisogno
 * di quella prova: se è un miss, quel colpo resta la sua unica spiegazione e non va tolto da `extras`.
 */
export function isAbsorbed(slots: Slot[], hit: Hit, claimed: Set<number>): boolean {
  const next = firstAfter(slots, hit.t)
  const prev = lastAtOrBefore(slots, hit.t)
  const o = next?.step.ornament
  if (next && claimed.has(next.index) && (o === 'flam' || o === 'drag') && next.t - hit.t <= ABSORB_BEFORE_S) {
    if (!prev || claimed.has(prev.index)) return true
  }
  const p = prev?.step.ornament
  if (
    prev &&
    claimed.has(prev.index) &&
    (p === 'buzz' || p === 'tremolo') &&
    hit.t > prev.t &&
    hit.t < prev.t + prev.dur
  )
    return true
  return false
}
