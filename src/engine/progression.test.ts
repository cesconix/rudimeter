import { describe, expect, it } from 'vitest'
import { DEFAULT_AUTO_INCREMENT, nextBpm, repeatAccuracy } from './progression'
import { buildGrid } from './grid'
import { judge } from './judge'
import { parseExercise } from './exercise'

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 6 })
const ai = { step: 4, after: 2, minAccuracy: 0.9, maxBpm: 66 }

/** colpi perfetti su tutte le ripetizioni < upTo, tranne gli slot elencati in `skip` */
const perfect = (upTo: number, skip: number[] = []) =>
  buildGrid(ex, 60, 0).slots.filter((s) => s.repeat < upTo && !skip.includes(s.index)).map((s) => ({ t: s.t, peakDb: -20 }))

describe('repeatAccuracy', () => {
  it('conta slot, good+ok e miss della ripetizione', () => {
    const grid = buildGrid(ex, 60, 0)
    const r = judge(grid.slots, perfect(1, [3]))
    expect(repeatAccuracy(r.judged, 0)).toEqual({ slots: 8, good: 7, miss: 1, accuracy: 7 / 8 })
  })
})

describe('nextBpm', () => {
  const grid = buildGrid(ex, 60, 0)
  it('prima di `after` ripetizioni chiuse: null', () => {
    expect(nextBpm(judge(grid.slots, perfect(1)), grid, 1, ai)).toBeNull()
  })
  it('due ripetizioni pulite → +4', () => {
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, ai)).toBe(64)
  })
  it('un miss nella finestra → null', () => {
    expect(nextBpm(judge(grid.slots, perfect(2, [5])), grid, 2, ai)).toBeNull()
  })
  it('rispetta il tetto e non propone lo stesso bpm', () => {
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, { ...ai, step: 10 })).toBe(66)
    expect(nextBpm(judge(grid.slots, perfect(2)), grid, 2, { ...ai, maxBpm: 60 })).toBeNull()
  })
  it('la finestra deve essere tutta al bpm corrente', () => {
    const mixed = { ...grid, repeats: grid.repeats.map((r, i) => (i === 0 ? { ...r, bpm: 56 } : r)) }
    expect(nextBpm(judge(grid.slots, perfect(2)), mixed, 2, ai)).toBeNull()
  })
  it('sull ultima ripetizione non c è nulla da alzare', () => {
    expect(nextBpm(judge(grid.slots, perfect(6)), grid, 5, ai)).toBeNull()
  })
  it('default: +4 ogni 4 ripetizioni al 90 %, tetto 240', () => {
    expect(DEFAULT_AUTO_INCREMENT).toEqual({ step: 4, after: 4, minAccuracy: 0.9, maxBpm: 240 })
  })
})
