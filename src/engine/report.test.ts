import { describe, expect, it } from 'bun:test'
import { EXERCISES } from '../data/exercises'
import { bpmRuns, toMarkdown } from './report'
import type { SessionStats } from './stats'
import { computeStats } from './stats'

const stats: SessionStats = {
  slots: 80,
  good: 60,
  ok: 10,
  off: 2,
  miss: 8,
  pending: 0,
  extras: 1,
  meanOffsetMs: 4.25,
  sdOffsetMs: 12.5,
  hands: [
    { hand: 'R', slots: 40, hits: 38, meanOffsetMs: 1.2, sdOffsetMs: 10.1, meanDb: -15.3, sdDb: 1.1 },
    { hand: 'L', slots: 40, hits: 34, meanOffsetMs: 7.8, sdOffsetMs: 14.9, meanDb: -19.9, sdDb: 2.4 },
  ],
  blocks: [
    { fromRepeat: 0, toRepeat: 4, slots: 40, miss: 2, sdOffsetMs: 11, meanDb: -17 },
    { fromRepeat: 5, toRepeat: 9, slots: 40, miss: 6, sdOffsetMs: 14, meanDb: -18.2 },
  ],
  absorbed: 3,
  uniformity: {
    sdDbTaps: 1.4,
    hands: [
      { hand: 'R', sdDbTaps: 1.1 },
      { hand: 'L', sdDbTaps: 1.7 },
    ],
  },
  accents: { slots: 20, hits: 19, meanDeltaDb: 7.2, belowThreshold: 2, thresholdDb: 6 },
  bpmByRepeat: [60, 60, 60, 60, 64, 64, 64, 64, 68, 68],
  guide: false,
}

describe('toMarkdown', () => {
  const md = toMarkdown(stats, EXERCISES[0], 80, new Date('2026-09-07T10:00:00Z'))

  it('opens with the date, the exercise and the bpm', () => {
    expect(md.split('\n')[0]).toBe('### 2026-09-07 — Stick Control #1 @ 80 bpm')
  })
  it('reports the totals and the offsets', () => {
    expect(md).toContain('Slots 80: good 60 · ok 10 · off 2 · miss 8 · extra 1')
    expect(md).toContain('Mean offset 4.3 ms (σ 12.5)')
  })
  it('has one row per hand and one per block, repeats 1-based', () => {
    expect(md).toContain('| R | 38/40 | 1.2 | 10.1 | -15.3 | 1.1 |')
    expect(md).toContain('| L | 34/40 | 7.8 | 14.9 | -19.9 | 2.4 |')
    expect(md).toContain('| 1–5 | 2/40 | 11.0 | -17.0 |')
    expect(md).toContain('| 6–10 | 6/40 | 14.0 | -18.2 |')
  })

  it('uses the local date, not UTC', () => {
    // Half past midnight on 8 September, local time: in UTC it is still the 7th.
    const d = new Date(2026, 8, 8, 0, 30)
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(toMarkdown(stats, EXERCISES[0], 80, d).split('\n')[0]).toBe(`### ${expected} — Stick Control #1 @ 80 bpm`)
  })
  it('records the calibration used, so that two logs stay comparable', () => {
    const md2 = toMarkdown(stats, EXERCISES[0], 80, new Date(), {
      latencyMs: 30.63,
      slope: 0.99,
      deviceLabel: 'iPad Microphone',
    })
    expect(md2).toContain('Calibration: latency 30.6 ms · slope 0.99 · iPad Microphone')
  })
  it('with no calibration it does not print the line', () => {
    expect(toMarkdown(stats, EXERCISES[0], 80, new Date())).not.toContain('Calibration:')
  })
  it('a missing slope becomes —', () => {
    const md2 = toMarkdown(stats, EXERCISES[0], 80, new Date(), { latencyMs: 75.6, slope: null, deviceLabel: '' })
    expect(md2).toContain('Calibration: latency 75.6 ms · slope —')
  })
  it('prints — in place of the nulls', () => {
    const md2 = toMarkdown({ ...stats, meanOffsetMs: null, sdOffsetMs: null }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Mean offset — ms (σ —)')
  })

  it('reports absorbed, evenness, accents and the compressed bpm curve', () => {
    expect(md).toContain('Slots 80: good 60 · ok 10 · off 2 · miss 8 · extra 1 · absorbed 3')
    expect(md).toContain('Evenness: σ dB 1.4 (R 1.1 · L 1.7)')
    expect(md).toContain('Accents: 19/20 · +7.2 dB over plain strokes · 2 below +6 dB')
    expect(md).toContain('Bpm: 60 ×4 → 64 ×4 → 68 ×2')
  })
  it('at constant bpm it does not print the curve; at zero absorbed it does not name them', () => {
    const md2 = toMarkdown({ ...stats, absorbed: 0, bpmByRepeat: [60, 60] }, EXERCISES[0], 60, new Date())
    expect(md2).not.toContain('Bpm:')
    expect(md2).not.toContain('absorbed')
  })
  it('with the guide sound the report declares it BEFORE the numbers', () => {
    // With no headphones the guide comes back in from the microphone on the expected instants: the
    // numbers below can describe a run that never happened, and the rereader must know it first.
    const md2 = toMarkdown({ ...stats, guide: true }, EXERCISES[0], 80, new Date())
    const lines = md2.split('\n')
    expect(lines[2]).toContain('Guide sound was on')
    expect(lines.findIndex((l) => l.startsWith('Slots 80'))).toBeGreaterThan(2)
  })
  it('with no guide sound no warning shows up', () => {
    expect(md).not.toContain('Guide sound')
  })

  it('bpmRuns compresses the consecutive repeats', () => {
    expect(bpmRuns([60, 60, 64])).toBe('60 ×2 → 64 ×1')
    expect(bpmRuns([])).toBe('')
  })

  it('a negative delta prints the minus sign, not "+-"', () => {
    const md2 = toMarkdown(
      { ...stats, accents: { slots: 20, hits: 19, meanDeltaDb: -3.2, belowThreshold: 15, thresholdDb: 6 } },
      EXERCISES[0],
      80,
      new Date(),
    )
    expect(md2).toContain('Accents: 19/20 · -3.2 dB over plain strokes · 15 below +6 dB')
    expect(md2).not.toContain('+-')
  })
  it('a null below-threshold (no reference tap) does not print a reassuring zero', () => {
    const md2 = toMarkdown(
      { ...stats, accents: { slots: 4, hits: 4, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 } },
      EXERCISES[0],
      80,
      new Date(),
    )
    expect(md2).toContain('Accents: 4/4 · — dB over plain strokes · — below +6 dB')
  })
  it('exercise with no accents: the Accents line does not show up at all', () => {
    const md2 = toMarkdown(
      { ...stats, accents: { slots: 0, hits: 0, meanDeltaDb: null, belowThreshold: null, thresholdDb: 6 } },
      EXERCISES[0],
      80,
      new Date(),
    )
    expect(md2).not.toContain('Accents:')
  })
  it('no hand with taps: no empty parentheses after the sd', () => {
    const md2 = toMarkdown({ ...stats, uniformity: { sdDbTaps: null, hands: [] } }, EXERCISES[0], 80, new Date())
    expect(md2).toContain('Evenness: σ dB —')
    expect(md2).not.toContain('()')
  })
  it('completely empty session: no NaN/undefined/Infinity in the markdown', () => {
    const empty = computeStats({ judged: [], extras: [], absorbed: [] })
    const md2 = toMarkdown(empty, EXERCISES[0], 80, new Date())
    expect(md2).not.toMatch(/NaN|undefined|Infinity/)
  })
})
