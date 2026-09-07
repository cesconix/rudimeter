/** Indici di `times` da schedulare ora: quelli in [from, …) con tempo < now + lookahead. */
export function dueIndices(times: number[], from: number, now: number, lookahead: number): { indices: number[]; next: number } {
  const indices: number[] = []
  let i = from
  while (i < times.length && times[i] < now + lookahead) {
    indices.push(i)
    i++
  }
  return { indices, next: i }
}

/** Lista ordinata di eventi con un cursore: ciò che è stato estratto non torna indietro. */
export class ClickQueue<T extends { t: number }> {
  private items: T[] = []
  private next = 0

  add(items: T[]): void {
    const tail = [...this.items.slice(this.next), ...items].sort((a, b) => a.t - b.t)
    this.items = [...this.items.slice(0, this.next), ...tail]
  }

  /**
   * Rimuove gli item non ancora estratti con t ≥ tCut.
   * Pura: la coda non conosce clock esterni. Gli item già estratti (indice < cursore) sono
   * strutturalmente immuni — la slice `[0, next)` è ricopiata intatta, qualunque sia tCut. Ma se
   * chi la usa ha già "committato" altrove (es. schedulato nel motore audio) degli item ancora
   * pending qui perché non ancora estratti da `due()`, tagliare proprio lì non li rimuove da quel
   * commit esterno: aggiunge solo un duplicato. È responsabilità del chiamante scegliere tCut oltre
   * quel punto di non ritorno (vedi `ClickScheduler.dropAfter`, che applica il margine).
   */
  dropAfter(tCut: number): void {
    this.items = [...this.items.slice(0, this.next), ...this.items.slice(this.next).filter((i) => i.t < tCut)]
  }

  /** Estrae, in ordine, gli item con t < now + lookahead. */
  due(now: number, lookahead: number): T[] {
    const { indices, next } = dueIndices(this.items.map((i) => i.t), this.next, now, lookahead)
    const out = indices.map((i) => this.items[i])
    this.next = next
    return out
  }

  get pending(): number {
    return this.items.length - this.next
  }
}
