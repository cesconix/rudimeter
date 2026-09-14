import type { LogLine } from '../src/analysis/analysis'

/** Appends what comes after the last held `seq`: a poll may overlap the previous one, never reorder. */
export function mergeLines(held: LogLine[], incoming: LogLine[]): LogLine[] {
  const last = held.length ? held[held.length - 1].seq : 0
  const fresh = incoming.filter((l) => typeof l.seq === 'number' && l.seq > last)
  return fresh.length ? [...held, ...fresh] : held
}
