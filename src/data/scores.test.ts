import { describe, expect, it } from 'bun:test'
import { flattenBar } from '../score/events'
import { add, type Fraction, ZERO } from '../score/fraction'
import type { Bar, Score } from '../score/types'
import { validate } from '../score/validate'
import { SCORES } from './scores'

const byId = (id: string): Score => {
  const s = SCORES.find((x) => x.id === id)
  if (!s) throw new Error(`no score ${id}`)
  return s
}
const isBeat = (x: Fraction): boolean => (x.num * 4) % x.den === 0

/** A bar as the sticking it was written from: hands joined per quarter, beats separated by a space, `-` for a rest. */
function stickingOf(bar: Bar): string {
  const beats: string[] = []
  let acc = ''
  let filled = ZERO
  for (const f of flattenBar(bar)) {
    acc += f.event.sticking ?? '-'
    filled = add(filled, f.length)
    if (isBeat(filled)) {
      beats.push(acc)
      acc = ''
    }
  }
  return beats.join(' ')
}
/** The rows as they read on the page: two bars each. */
const rowsOf = (s: Score): string[] => {
  const rows: string[] = []
  for (let i = 0; i < s.bars.length; i += 2) rows.push(`${stickingOf(s.bars[i])} | ${stickingOf(s.bars[i + 1])}`)
  return rows
}
const sounding = (s: Score) => s.bars.flatMap(flattenBar).filter((f) => !f.event.rest)

describe('SCORES', () => {
  it('validates every entry and keeps the ids unique', () => {
    for (const s of SCORES) expect({ id: s.id, problems: validate(s) }).toEqual({ id: s.id, problems: [] })
    expect(new Set(SCORES.map((s) => s.id)).size).toBe(SCORES.length)
  })
  it('starts with the sticking library, in its order, then the three pad pieces', () => {
    expect(SCORES.map((s) => s.id)).toEqual([
      'stone-1',
      'stone-3',
      'stone-5',
      'reading-4-4',
      'pyramid-singles',
      'pyramid-doubles',
      'workout-43',
    ])
  })
})

// The pyramid rows are the output of a rule — each row adds a quartina to the one before — run
// once and committed as JSON, not a hand transcription of thirty bars, where a single wrong
// letter would be invisible. These tests read the JSON back as the sticking it came from.
describe('stroke pyramid', () => {
  it('is fifteen rows: up to the longest and back down, the apex played once', () => {
    const s = byId('pyramid-singles')
    expect(rowsOf(s)).toHaveLength(15)
    expect(s.bars).toHaveLength(30)
    expect(s.bars[0].meter).toEqual([4, 4])
    expect(s.bars.map((b) => b.newRow === true)).toEqual(s.bars.map((_, i) => i > 0 && i % 2 === 0))
    expect(s.bars.some((b) => b.repeat)).toBe(false)
  })
  it('grows a quartina per row, in singles', () => {
    const rows = rowsOf(byId('pyramid-singles'))
    expect([rows[0], rows[7], rows.at(-1)]).toEqual([
      'RLRL RL RL RL | RL RL RL RL',
      'RLRL RLRL RLRL RLRL | RLRL RLRL RLRL RLRL',
      'RLRL RL RL RL | RL RL RL RL',
    ])
    expect(rows[4]).toBe('RLRL RLRL RLRL RLRL | RLRL RL RL RL')
  })
  it('grows a quartina per row, in doubles, and leaves the eighths alternating', () => {
    const rows = rowsOf(byId('pyramid-doubles'))
    expect([rows[0], rows[7], rows.at(-1)]).toEqual([
      'RRLL RL RL RL | RL RL RL RL',
      'RRLL RRLL RRLL RRLL | RRLL RRLL RRLL RRLL',
      'RRLL RL RL RL | RL RL RL RL',
    ])
    expect(rows[4]).toBe('RRLL RRLL RRLL RRLL | RRLL RL RL RL')
  })
  it('comes back down mirroring the way up', () => {
    const rows = rowsOf(byId('pyramid-singles'))
    expect(rows.slice(8)).toEqual(rows.slice(0, 7).reverse())
  })
  it('is the same rhythm in both versions, 368 strokes, no accent', () => {
    const singles = byId('pyramid-singles')
    const doubles = byId('pyramid-doubles')
    expect(sounding(singles)).toHaveLength(368)
    expect(sounding(doubles)).toHaveLength(368)
    expect(sounding(doubles).map((f) => f.length)).toEqual(sounding(singles).map((f) => f.length))
    expect(sounding(singles).some((f) => f.event.accent)).toBe(false)
    expect(sounding(doubles).some((f) => f.event.accent)).toBe(false)
  })
})

describe('50 Workout #43', () => {
  const s = byId('workout-43')
  /** The bar's onsets on the sixteenth grid, beat by beat: what the rhythm is, whatever the spelling. */
  const grid = (bar: Bar): string => {
    const cells = Array.from({ length: 16 }, () => '-')
    for (const f of flattenBar(bar)) if (!f.event.rest) cells[(f.offset.num * 16) / f.offset.den] = 'x'
    return cells.join('').replace(/(.{4})(?=.)/g, '$1 ')
  }
  it('is the sixteen patterns of the page, two repeated sections, two bars per row', () => {
    expect(s.bars).toHaveLength(16)
    expect(s.bars.map(grid)).toEqual([
      'x--- x--- x--- x---',
      '-x-- -x-- -x-- -x--',
      '--x- --x- --x- --x-',
      '---x ---x ---x ---x',
      'xx-- xx-- xx-- xx--',
      '--xx --xx --xx --xx',
      '-xx- -xx- -xx- -xx-',
      'x--x x--x x--x x--x',
      'x-x- x-x- x-x- x-x-',
      '-x-x -x-x -x-x -x-x',
      'xxx- xxx- xxx- xxx-',
      '-xxx -xxx -xxx -xxx',
      'x-xx x-xx x-xx x-xx',
      'xx-x xx-x xx-x xx-x',
      'xxxx ---- xxxx ----',
      '---- xxxx ---- xxxx',
    ])
    expect(s.bars[0].repeat).toEqual({ start: true })
    expect(s.bars[3].repeat).toEqual({ end: { times: 2 } })
    expect(s.bars[15].repeat).toEqual({ end: { times: 2 } })
    expect(s.bars.map((b) => b.newRow === true)).toEqual(s.bars.map((_, i) => i > 0 && i % 2 === 0))
  })
  it("uses the book's spellings, not the grid's", () => {
    const spell = (bar: Bar) =>
      flattenBar(bar)
        .slice(0, 4)
        .map((f) => `${f.event.rest ? 'r' : 'n'}${f.event.duration.base}${f.event.duration.dots ? '.' : ''}`)
    expect(spell(s.bars[1]).slice(0, 2)).toEqual(['r16', 'n8.'])
    expect(spell(s.bars[3]).slice(0, 2)).toEqual(['r8.', 'n16'])
    expect(spell(s.bars[7]).slice(0, 2)).toEqual(['n8.', 'n16'])
    expect(spell(s.bars[13]).slice(0, 3)).toEqual(['n16', 'n8', 'n16'])
    expect(spell(s.bars[14]).slice(0, 4)).toEqual(['n16', 'n16', 'n16', 'n16'])
    expect(sounding(s)).toHaveLength(4 + 4 + 4 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 12 + 12 + 12 + 12 + 8 + 8)
  })
})
