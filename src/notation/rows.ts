/**
 * Keeps engraved only the rows a viewport needs: the visible ones plus one on each side, so a
 * scroll that reveals the next row finds it already drawn. Thirty rows of VexFlow SVG are a lot of
 * DOM for an iPad; three to five are not. Pure: it knows nothing of the host or the SVG, only how
 * to make a row and that a row can be disposed — which is what makes it testable without a DOM,
 * and what will let canvas rows sit behind the same interface if the measurement ever asks for them.
 */
export class RowPool<T extends { dispose(): void }> {
  private readonly rows = new Map<number, T>()

  constructor(
    private readonly rowCount: number,
    private readonly engrave: (row: number) => T,
  ) {}

  /** Rows `[first − 1, last + 1]` alive, clamped to the piece; everything else disposed. Rows are engraved in ascending order. */
  ensure(first: number, last: number): void {
    const lo = Math.max(0, first - 1)
    const hi = Math.min(this.rowCount - 1, last + 1)
    for (const [row, engraved] of this.rows) {
      if (row < lo || row > hi) {
        engraved.dispose()
        this.rows.delete(row)
      }
    }
    for (let row = lo; row <= hi; row++) if (!this.rows.has(row)) this.rows.set(row, this.engrave(row))
  }

  /** Scale or score changed: nothing drawn is right any more. */
  invalidate(): void {
    for (const engraved of this.rows.values()) engraved.dispose()
    this.rows.clear()
  }

  alive(): number[] {
    return [...this.rows.keys()].sort((a, b) => a - b)
  }

  get(row: number): T | undefined {
    return this.rows.get(row)
  }
}

/**
 * `ensure` off the frame step. A row engraves in 3 ms alone on the iPad and 9–12 ms inside a rAF
 * step (the gallery's motion lines, plan 10), which is the whole budget at 60 Hz: every frame that
 * carried an engrave was a dropped frame. Deferred to its own task the engrave runs between frames,
 * and the pool's ±1 margin means the row was asked for a whole row of music before it is needed.
 * Calls made before the task runs collapse into the last one; `cancel` drops a pending window —
 * a re-layout replaces the pool, and a task queued for the old one must not draw into it.
 * `schedule` is injectable for the tests; the default is a 0 ms timer, which the browser runs
 * after the current frame's rendering, not inside it.
 */
export function deferEnsure<T extends { dispose(): void }>(
  pool: RowPool<T>,
  schedule: (run: () => void) => void = (run) => {
    setTimeout(run, 0)
  },
): { ensure(first: number, last: number): void; cancel(): void } {
  let wanted: [number, number] | null = null
  let cancelled = false
  return {
    ensure(first, last) {
      if (cancelled) return
      const pending = wanted !== null
      wanted = [first, last]
      if (pending) return
      schedule(() => {
        const w = wanted
        wanted = null
        if (w && !cancelled) pool.ensure(w[0], w[1])
      })
    },
    cancel() {
      cancelled = true
      wanted = null
    },
  }
}
