import { describe, expect, it } from 'bun:test'
import { RowPool } from './rows'

/** A pool over fake rows that record their life: `engraved` in order of creation, `disposed` in order of disposal. */
function pool(count: number) {
  const engraved: number[] = []
  const disposed: number[] = []
  const p = new RowPool(count, (row) => {
    engraved.push(row)
    return { row, dispose: () => disposed.push(row) }
  })
  return { p, engraved, disposed }
}

describe('RowPool', () => {
  it('keeps the asked rows plus one on each side, in order, and nothing else', () => {
    const { p, engraved } = pool(10)
    p.ensure(2, 4)
    expect(p.alive()).toEqual([1, 2, 3, 4, 5])
    expect(engraved).toEqual([1, 2, 3, 4, 5])
  })

  it('clamps the margin to the piece', () => {
    const { p } = pool(10)
    p.ensure(0, 0)
    expect(p.alive()).toEqual([0, 1])
    p.ensure(9, 9)
    expect(p.alive()).toEqual([8, 9])
  })

  it('moving the window engraves only the new rows and disposes only the ones that left', () => {
    const { p, engraved, disposed } = pool(10)
    p.ensure(2, 4)
    p.ensure(4, 6)
    expect(p.alive()).toEqual([3, 4, 5, 6, 7])
    expect(engraved).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(disposed).toEqual([1, 2])
  })

  it('a row asked again is the same object', () => {
    const { p } = pool(10)
    p.ensure(2, 4)
    const three = p.get(3)
    p.ensure(3, 5)
    expect(p.get(3)).toBe(three)
    expect(p.get(0)).toBeUndefined()
  })

  it('invalidate disposes everything; the next ensure engraves afresh', () => {
    const { p, engraved, disposed } = pool(10)
    p.ensure(2, 4)
    p.invalidate()
    expect(p.alive()).toEqual([])
    expect(disposed).toEqual([1, 2, 3, 4, 5])
    p.ensure(2, 2)
    expect(engraved).toEqual([1, 2, 3, 4, 5, 1, 2, 3])
  })

  it('an empty piece never engraves', () => {
    const { p, engraved } = pool(0)
    p.ensure(0, 3)
    expect(p.alive()).toEqual([])
    expect(engraved).toEqual([])
  })

  it('a window past the end asks for nothing', () => {
    const { p } = pool(3)
    p.ensure(5, 9)
    expect(p.alive()).toEqual([])
  })
})
