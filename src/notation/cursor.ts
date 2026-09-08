export interface CursorPoint {
  t: number
  x: number
}

/** x del cursore a `now`, interpolando fra i punti adiacenti (ordinati per t). Prima del primo = x0, dopo l'ultimo = xN. */
export function cursorX(points: CursorPoint[], now: number): number {
  if (points.length === 0) return 0
  if (now <= points[0].t) return points[0].x
  const last = points[points.length - 1]
  if (now >= last.t) return last.x
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= now) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  return a.x + ((b.x - a.x) * (now - a.t)) / (b.t - a.t)
}
