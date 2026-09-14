import type { LogLine } from '../src/analysis/analysis'
import { mergeLines } from './merge-lines'

/** Fetches the lines a device has past `since`. */
export type FetchLines = (name: string, since: number) => Promise<LogLine[]>

export interface Poller {
  /** Every line held for a device so far, in seq order. */
  held(name: string): LogLine[]
  /**
   * Pulls new lines for a device. One request in flight per device at a time: a call that arrives
   * while an earlier one for the same device is still out is dropped, not queued — the caller's next
   * regular tick re-reads anyway. Resolves to whether anything new landed.
   */
  pull(name: string): Promise<boolean>
}

/**
 * Pages until the store answers with nothing. It does not compare the size of a response against the
 * page it asked for: the API clamps `limit` silently (see the paging contract in `api/_lib/handler.ts`),
 * so a short page means "that is what fits", and stopping there truncated the device's history without
 * a word. Only an empty response is the end.
 *
 * The in-flight guard already stops two requests for the same device from overlapping, so a response
 * can never legitimately arrive out of order — but it is merged against `held(name)` read fresh at that
 * moment regardless, never against the snapshot taken before the request went out. That is what makes a
 * stale or superseded response safe to apply even so: `mergeLines` only appends lines past the highest
 * `seq` already held, so applying one can add lines or do nothing, never roll the view backward.
 */
export function createPoller(fetchLines: FetchLines): Poller {
  const logs = new Map<string, LogLine[]>()
  const inFlight = new Set<string>()

  const held = (name: string): LogLine[] => logs.get(name) ?? []

  async function pullOnce(name: string): Promise<boolean> {
    const before = held(name)
    const since = before.length ? before[before.length - 1].seq : 0
    const added = await fetchLines(name, since)
    if (!added.length) return false
    const current = held(name)
    const merged = mergeLines(current, added)
    logs.set(name, merged)
    const more = await pullOnce(name)
    return more || merged !== current
  }

  async function pull(name: string): Promise<boolean> {
    if (inFlight.has(name)) return false
    inFlight.add(name)
    try {
      return await pullOnce(name)
    } finally {
      inFlight.delete(name)
    }
  }

  return { held, pull }
}
