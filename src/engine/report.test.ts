import { describe, expect, it } from 'vitest'
import { toMarkdown } from './report'
import type { SessionStats } from './stats'
import { EXERCISES } from '../data/exercises'

const stats: SessionStats = {
  slots: 80, good: 60, ok: 10, off: 2, miss: 8, pending: 0, extras: 1,
  meanOffsetMs: 4.25, sdOffsetMs: 12.5,
  hands: [
    { hand: 'R', slots: 40, hits: 38, meanOffsetMs: 1.2, sdOffsetMs: 10.1, meanDb: -15.3, sdDb: 1.1 },
    { hand: 'L', slots: 40, hits: 34, meanOffsetMs: 7.8, sdOffsetMs: 14.9, meanDb: -19.9, sdDb: 2.4 },
  ],
  blocks: [
    { fromRepeat: 0, toRepeat: 4, slots: 40, miss: 2, sdOffsetMs: 11, meanDb: -17 },
    { fromRepeat: 5, toRepeat: 9, slots: 40, miss: 6, sdOffsetMs: 14, meanDb: -18.2 },
  ],
}

describe('toMarkdown', () => {
  const md = toMarkdown(stats, EXERCISES[0], 80, new Date('2026-09-07T10:00:00Z'))

  it('apre con data, esercizio e bpm', () => {
    expect(md.split('\n')[0]).toBe('### 2026-09-07 — Stick Control #1 @ 80 bpm')
  })
  it('riporta i totali e gli offset', () => {
    expect(md).toContain('Slot 80: good 60 · ok 10 · off 2 · miss 8 · extra 1')
    expect(md).toContain('Offset medio 4.3 ms (σ 12.5)')
  })
  it('ha una riga per mano e una per blocco, ripetizioni 1-based', () => {
    expect(md).toContain('| R | 38/40 | 1.2 | 10.1 | -15.3 | 1.1 |')
    expect(md).toContain('| L | 34/40 | 7.8 | 14.9 | -19.9 | 2.4 |')
    expect(md).toContain('| 1–5 | 2/40 | 11.0 | -17.0 |')
    expect(md).toContain('| 6–10 | 6/40 | 14.0 | -18.2 |')
  })
  it('stampa — al posto dei null', () => {
    const md2 = toMarkdown({ ...stats, meanOffsetMs: null, sdOffsetMs: null }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Offset medio — ms (σ —)')
  })
})
