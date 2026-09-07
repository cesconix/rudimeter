import { describe, expect, it } from 'vitest'
import { bpmRuns, toMarkdown } from './report'
import { computeStats } from './stats'
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
  absorbed: 3,
  uniformity: { sdDbTaps: 1.4, hands: [{ hand: 'R', sdDbTaps: 1.1 }, { hand: 'L', sdDbTaps: 1.7 }] },
  accents: { slots: 20, hits: 19, meanDeltaDb: 7.2, belowThreshold: 2, thresholdDb: 6 },
  bpmByRepeat: [60, 60, 60, 60, 64, 64, 64, 64, 68, 68],
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

  it('usa la data locale, non UTC', () => {
    // Mezzanotte e mezza dell'8 settembre, ora locale: in UTC è ancora il 7.
    const d = new Date(2026, 8, 8, 0, 30)
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(toMarkdown(stats, EXERCISES[0], 80, d).split('\n')[0]).toBe(`### ${expected} — Stick Control #1 @ 80 bpm`)
  })
  it('registra la calibrazione usata, così due log restano confrontabili', () => {
    const md2 = toMarkdown(stats, EXERCISES[0], 80, new Date(), { latencyMs: 30.63, slope: 0.99, deviceLabel: 'iPad Microphone' })
    expect(md2).toContain('Calibrazione: latenza 30.6 ms · pendenza 0.99 · iPad Microphone')
  })
  it('senza calibrazione non stampa la riga', () => {
    expect(toMarkdown(stats, EXERCISES[0], 80, new Date())).not.toContain('Calibrazione:')
  })
  it('pendenza assente diventa —', () => {
    const md2 = toMarkdown(stats, EXERCISES[0], 80, new Date(), { latencyMs: 75.6, slope: null, deviceLabel: '' })
    expect(md2).toContain('Calibrazione: latenza 75.6 ms · pendenza —')
  })
  it('stampa — al posto dei null', () => {
    const md2 = toMarkdown({ ...stats, meanOffsetMs: null, sdOffsetMs: null }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Offset medio — ms (σ —)')
  })

  it('riporta assorbiti, uniformità, accenti e la curva dei bpm compressa', () => {
    expect(md).toContain('Slot 80: good 60 · ok 10 · off 2 · miss 8 · extra 1 · assorbiti 3')
    expect(md).toContain('Uniformità: σ dB 1.4 (R 1.1 · L 1.7)')
    expect(md).toContain('Accenti: 19/20 · +7.2 dB sui colpi normali · 2 sotto +6 dB')
    expect(md).toContain('Bpm: 60 ×4 → 64 ×4 → 68 ×2')
  })
  it('a bpm costante non stampa la curva; a zero assorbiti non li nomina', () => {
    const md2 = toMarkdown({ ...stats, absorbed: 0, bpmByRepeat: [60, 60] }, EXERCISES[0], 60, new Date())
    expect(md2).not.toContain('Bpm:')
    expect(md2).not.toContain('assorbiti')
  })
  it('bpmRuns comprime le ripetizioni consecutive', () => {
    expect(bpmRuns([60, 60, 64])).toBe('60 ×2 → 64 ×1')
    expect(bpmRuns([])).toBe('')
  })

  it('un delta negativo stampa il segno meno, non "+-"', () => {
    const md2 = toMarkdown({ ...stats, accents: { slots: 20, hits: 19, meanDeltaDb: -3.2, belowThreshold: 15, thresholdDb: 6 } }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Accenti: 19/20 · -3.2 dB sui colpi normali · 15 sotto +6 dB')
    expect(md2).not.toContain('+-')
  })
  it('sotto-soglia null (nessun tap di riferimento) non stampa uno zero rassicurante', () => {
    const md2 = toMarkdown({ ...stats, accents: { slots: 4, hits: 4, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 } }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Accenti: 4/4 · — dB sui colpi normali · — sotto +6 dB')
  })
  it('esercizio senza accenti: la riga Accenti non compare affatto', () => {
    const md2 = toMarkdown({ ...stats, accents: { slots: 0, hits: 0, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 } }, EXERCISES[0], 80, new Date())
    expect(md2).not.toContain('Accenti:')
  })
  it('nessuna mano con taps: niente parentesi vuote dopo la sd', () => {
    const md2 = toMarkdown({ ...stats, uniformity: { sdDbTaps: null, hands: [] } }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Uniformità: σ dB —')
    expect(md2).not.toContain('()')
  })
  it('sessione completamente vuota: nessun NaN/undefined/Infinity nel markdown', () => {
    const empty = computeStats({ judged: [], extras: [], absorbed: [] })
    const md2 = toMarkdown(empty, EXERCISES[0], 80, new Date())
    expect(md2).not.toMatch(/NaN|undefined|Infinity/)
  })
})
