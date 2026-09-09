export interface CursorPoint {
  t: number
  x: number
  /** row index: the cursor interpolates inside the row, not across it */
  row: number
}

/**
 * Cursor position at `now`: x in screen pixels inside the row, plus the row it is on.
 * Interpolates between adjacent points (sorted by t); before the first one it sits on the first,
 * after the last one on the last.
 *
 * `rowEndX` is the x the cursor reaches at the end of the row (right edge of the score, already in
 * screen pixels): it is only needed in the interval that spans the row wrap — see below.
 */
export function cursorAt(points: CursorPoint[], now: number, rowEndX: number): { x: number; row: number } {
  if (points.length === 0) return { x: 0, row: 0 }
  if (now <= points[0].t) return { x: points[0].x, row: points[0].row }
  const last = points[points.length - 1]
  if (now >= last.t) return { x: last.x, row: last.row }
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= now) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  // Across the row wrap the x does not interpolate towards `b`: it would move backwards on screen,
  // because the next row starts again from the left. But it does not stop on `a` either: that would
  // be the only moment where the cursor sits still while the music keeps going, and to the eye it
  // reads as a stutter right where trust matters. During the time of the row's last note it slides
  // to the right edge and reappears on the left on the row below — like it exits the scene, not
  // like it jams.
  // `max` with `a.x`: a `rowEndX` to the left of the last note (a score narrower than its own
  // notes, which should not happen) would send the cursor backwards. Better still than reversed.
  if (a.row !== b.row) {
    const end = Math.max(a.x, rowEndX)
    return { x: a.x + ((end - a.x) * (now - a.t)) / (b.t - a.t), row: a.row }
  }
  return { x: a.x + ((b.x - a.x) * (now - a.t)) / (b.t - a.t), row: a.row }
}
