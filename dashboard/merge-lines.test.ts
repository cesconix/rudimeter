import { describe, expect, it } from 'bun:test'
import { mergeLines } from './merge-lines'

const l = (seq: number) => ({ event: 'e', at: 'a', seq })

describe('mergeLines', () => {
  it('appends only lines past the last held seq, keeps the same array when nothing is new', () => {
    const held = [l(1), l(2)]
    expect(mergeLines(held, [l(2), l(3), l(4)]).map((x) => x.seq)).toEqual([1, 2, 3, 4])
    expect(mergeLines(held, [l(1), l(2)])).toBe(held)
    expect(mergeLines([], [l(5)]).map((x) => x.seq)).toEqual([5])
  })
})
