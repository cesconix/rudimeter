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
