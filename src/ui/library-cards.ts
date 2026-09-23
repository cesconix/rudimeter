import { metersOf } from '../score/events'
import type { Score } from '../score/types'
import { unroll } from '../score/unroll'

/** What a card of the library says about a piece, read from the score: nothing here needs the DOM. */
export interface LibraryCard {
  id: string
  title: string
  /** the book and the page, when the piece has one */
  source?: string
  /** the first bar's meter, as the row start prints it */
  meter: string
  /** the drawn bars, every pass of a repeat counted: the M of the transport bar's "bar N / M" */
  bars: number
}

export function libraryCards(scores: readonly Score[]): LibraryCard[] {
  return scores.map((score) => {
    const [num, den] = metersOf(score)[0]
    const card: LibraryCard = { id: score.id, title: score.title, meter: `${num}/${den}`, bars: unroll(score).length }
    // Set only when the piece has one: a card with `source: undefined` is not a card without a source.
    if (score.source !== undefined) card.source = score.source
    return card
  })
}
