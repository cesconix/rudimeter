import { describe, expect, it } from 'bun:test'
import { barsOf, slotsPerRepeat, stepsFlat } from '../engine/exercise'
import { EXERCISES } from './exercises'

const byId = (id: string) => {
  const ex = EXERCISES.find((e) => e.id === id)
  if (!ex) throw new Error(`no exercise ${id}`)
  return ex
}

/** The rows as they read on the page, so a change to the generator has to face the paper. */
const ROWS = (bars: string[]) => ({ first: bars[0], apex: bars[7], last: bars.at(-1) })
const rowsOf = (sticking: string): string[] => {
  const bars = sticking.split('|').map((s) => s.trim())
  const rows: string[] = []
  for (let i = 0; i < bars.length; i += 2) rows.push(`${bars[i]} | ${bars[i + 1]}`)
  return rows
}

describe('stroke pyramid', () => {
  it('is fifteen rows: up to the longest and back down, the apex played once', () => {
    const ex = byId('pyramid-singles')
    expect(rowsOf(ex.sticking)).toHaveLength(15)
    expect(barsOf(ex)).toBe(30)
    expect(ex.timeSignature).toEqual([4, 4])
  })

  it('grows a quartina per row, in singles', () => {
    const rows = rowsOf(byId('pyramid-singles').sticking)
    expect(ROWS(rows)).toEqual({
      first: 'RLRL RL RL RL | RL RL RL RL',
      apex: 'RLRL RLRL RLRL RLRL | RLRL RLRL RLRL RLRL',
      last: 'RLRL RL RL RL | RL RL RL RL',
    })
    expect(rows[4]).toBe('RLRL RLRL RLRL RLRL | RLRL RL RL RL')
  })

  it('grows a quartina per row, in doubles, and leaves the eighths alternating', () => {
    const rows = rowsOf(byId('pyramid-doubles').sticking)
    expect(ROWS(rows)).toEqual({
      first: 'RRLL RL RL RL | RL RL RL RL',
      apex: 'RRLL RRLL RRLL RRLL | RRLL RRLL RRLL RRLL',
      last: 'RRLL RL RL RL | RL RL RL RL',
    })
    expect(rows[4]).toBe('RRLL RRLL RRLL RRLL | RRLL RL RL RL')
  })

  it('comes back down mirroring the way up', () => {
    const rows = rowsOf(byId('pyramid-singles').sticking)
    expect(rows.slice(8)).toEqual(rows.slice(0, 7).reverse())
  })

  it('is the same rhythm in both versions, 368 strokes, no accent', () => {
    const singles = byId('pyramid-singles')
    const doubles = byId('pyramid-doubles')
    expect(slotsPerRepeat(singles)).toBe(368)
    expect(slotsPerRepeat(doubles)).toBe(368)
    const shape = (id: string) => stepsFlat(byId(id)).map((f) => f.n)
    expect(shape('pyramid-doubles')).toEqual(shape('pyramid-singles'))
    expect(stepsFlat(singles).some((f) => f.step.accent)).toBe(false)
    expect(stepsFlat(doubles).some((f) => f.step.accent)).toBe(false)
  })
})
