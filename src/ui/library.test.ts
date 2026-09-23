import { describe, expect, it } from 'bun:test'
import { SCORES } from '../data/scores'
import { metersOf } from '../score/events'
import { unroll } from '../score/unroll'
import { libraryCards } from './library'

describe('libraryCards', () => {
  it('one card per piece, in the library’s order: title, source, the first bar’s meter, the drawn bars', () => {
    const cards = libraryCards(SCORES)
    expect(cards.map((c) => c.id)).toEqual(SCORES.map((s) => s.id))
    for (const [i, card] of cards.entries()) {
      const score = SCORES[i]
      const [num, den] = metersOf(score)[0]
      expect(card.title).toBe(score.title)
      expect(card.source).toBe(score.source)
      expect(card.meter).toBe(`${num}/${den}`)
      // The M of the transport bar's "bar N / M": every pass of a repeat counts.
      expect(card.bars).toBe(unroll(score).length)
    }
    expect(cards.find((c) => c.id === 'workout-43')).toMatchObject({ meter: '4/4', bars: 32 })
    expect(cards.find((c) => c.id === 'stone-1')).toMatchObject({ meter: '2/4', bars: 40 })
  })

  it('a piece without a source has no source on its card', () => {
    const { source: _, ...bare } = SCORES[0]
    const [card] = libraryCards([bare])
    expect(card.source).toBeUndefined()
    expect('source' in card).toBe(false)
  })
})
