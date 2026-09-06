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
