/** Lookahead (s) and tick interval (ms) the audio-clock schedulers share. The replan cut in the Drummer and in
 * the ClickScheduler must be computed from the same numbers, or a stroke can survive at the old tempo while
 * its click moves. */
export const SCHEDULER_DEFAULTS = { lookahead: 0.1, intervalMs: 25 } as const

/** Indices of `times` to schedule now: those in [from, …) with time < now + lookahead. */
export function dueIndices(
  times: number[],
  from: number,
  now: number,
  lookahead: number,
): { indices: number[]; next: number } {
  const indices: number[] = []
  let i = from
  while (i < times.length && times[i] < now + lookahead) {
    indices.push(i)
    i++
  }
  return { indices, next: i }
}

/** Ordered list of events with a cursor: what has been pulled out does not come back. */
export class ClickQueue<T extends { t: number }> {
  private items: T[] = []
  private next = 0

  add(items: T[]): void {
    const tail = [...this.items.slice(this.next), ...items].sort((a, b) => a.t - b.t)
    this.items = [...this.items.slice(0, this.next), ...tail]
  }

  /**
   * Removes the items not yet pulled out with t ≥ tCut.
   * Pure: the queue knows nothing of external clocks. The items already pulled out (index < cursor)
   * are structurally immune — the `[0, next)` slice is copied over intact, whatever tCut is. But if
   * the caller has already "committed" elsewhere (e.g. scheduled in the audio engine) items still
   * pending here because `due()` has not pulled them out yet, cutting right there does not remove
   * them from that external commit: it only adds a duplicate. It is up to the caller to pick a tCut
   * beyond that point of no return (see `ClickScheduler.dropAfter`, which applies the margin).
   */
  dropAfter(tCut: number): void {
    this.items = [...this.items.slice(0, this.next), ...this.items.slice(this.next).filter((i) => i.t < tCut)]
  }

  /** Pulls out, in order, the items with t < now + lookahead. */
  due(now: number, lookahead: number): T[] {
    const { indices, next } = dueIndices(
      this.items.map((i) => i.t),
      this.next,
      now,
      lookahead,
    )
    const out = indices.map((i) => this.items[i])
    this.next = next
    return out
  }

  get pending(): number {
    return this.items.length - this.next
  }
}
