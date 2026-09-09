import type { Grade, Hit, Judged, JudgeResult, Slot, Windows } from './types'
import { DEFAULT_WINDOWS } from './types'

export interface JudgeOptions {
  windows?: Windows
  /** current time: the slots whose window is still open stay 'pending' */
  now?: number
}

function gradeOf(offsetMs: number, w: Windows): Grade {
  const a = Math.abs(offsetMs)
  if (a <= w.goodMs) return 'good'
  if (a <= w.okMs) return 'ok'
  return 'off'
}

/** Rounds to the microsecond: keeps 1.02 − 1 from giving 20.000000000000018 ms. */
function offsetMs(hit: Hit, slot: Slot): number {
  return Math.round((hit.t - slot.t) * 1e6) / 1000
}

/** `slots` sorted by t (they are by construction: buildGrid). */
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

/** An extra up to 60 ms before a flam/drag slot is the grace note. */
const ABSORB_BEFORE_S = 0.06

/** First slot with t > x, or undefined. `slots` sorted by t. */
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

/** Last slot with t ≤ x, or undefined. */
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
 * An extra is absorbed if it is the grace note of an imminent flam/drag or a bounce inside a buzz/tremolo in progress.
 * `claimed` = indices of the slots that have a main hit assigned (see `judge`): a grace note without the
 * main hit is not a grace note, so absorption only holds if the ornamented slot was assigned.
 * For flam/drag there is one more condition: the slot right before the ornamented one must not be a miss.
 * A late hit that escapes the window of the previous slot and an early grace note take up the same
 * time interval — no geometry tells them apart. What tells them apart is whether the previous slot needs
 * that evidence: if it is a miss, that hit stays its only explanation and must not be taken out of `extras`.
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
