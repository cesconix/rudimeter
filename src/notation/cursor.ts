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
 *
 * `rowEndX` è la x a cui il cursore arriva a fine riga (bordo destro della partitura, già in pixel
 * di schermo): serve solo nell'intervallo che scavalca il capo riga — vedi sotto.
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
  // Attraverso il capo riga la x non si interpola verso `b`: tornerebbe indietro sullo schermo,
  // perché la riga dopo riparte da sinistra. Ma nemmeno si ferma su `a`: sarebbe l'unico momento in
  // cui il cursore sta immobile mentre la musica va avanti, e a occhio si legge come un inceppamento
  // proprio dove serve fiducia. Nel tempo dell'ultima nota della riga scivola fino al bordo destro e
  // riappare a sinistra sulla riga sotto — come esce di scena, non come si blocca.
  // `max` con `a.x`: un `rowEndX` più a sinistra dell'ultima nota (partitura più stretta delle sue
  // note, non dovrebbe capitare) manderebbe il cursore all'indietro. Meglio fermo che al contrario.
  if (a.row !== b.row) {
    const end = Math.max(a.x, rowEndX)
    return { x: a.x + ((end - a.x) * (now - a.t)) / (b.t - a.t), row: a.row }
  }
  return { x: a.x + ((b.x - a.x) * (now - a.t)) / (b.t - a.t), row: a.row }
}
