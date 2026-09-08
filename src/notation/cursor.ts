export interface CursorPoint {
  t: number
  x: number
  /** indice della riga: il cursore interpola dentro la riga, non attraverso */
  row: number
}

/**
 * Posizione del cursore a `now`: x in pixel di schermo dentro la riga, più la riga su cui sta.
 * Interpola fra i punti adiacenti (ordinati per t); prima del primo sta sul primo, dopo l'ultimo
 * sull'ultimo.
 */
export function cursorAt(points: CursorPoint[], now: number): { x: number; row: number } {
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
  // Attraverso il capo riga la x non si interpola: tornerebbe indietro sullo schermo. Il cursore
  // resta sull'ultima nota della riga finché non inizia la successiva — è ciò che fa l'occhio.
  if (a.row !== b.row) return { x: a.x, row: a.row }
  return { x: a.x + ((b.x - a.x) * (now - a.t)) / (b.t - a.t), row: a.row }
}
