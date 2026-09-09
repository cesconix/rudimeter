import { describe, expect, it } from 'bun:test'
import { ClickQueue, dueIndices } from './scheduler'

describe('dueIndices', () => {
  const times = [1, 1.5, 2, 2.5, 3]
  it('returns the indices with time < now + lookahead starting from from', () => {
    expect(dueIndices(times, 0, 0.95, 0.1)).toEqual({ indices: [0], next: 1 })
    expect(dueIndices(times, 1, 1.45, 0.1)).toEqual({ indices: [1], next: 2 })
    expect(dueIndices(times, 2, 2.6, 0.1)).toEqual({ indices: [2, 3], next: 4 })
  })
  it('nothing to schedule: empty indices, from unchanged', () => {
    expect(dueIndices(times, 2, 1.0, 0.1)).toEqual({ indices: [], next: 2 })
    expect(dueIndices(times, 5, 99, 0.1)).toEqual({ indices: [], next: 5 })
  })
})

describe('ClickQueue', () => {
  const c = (t: number) => ({ t })
  it('pulls out in order what falls inside the lookahead and does not pull it out again', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1), c(0.5), c(2)])
    expect(q.due(0.45, 0.1).map((x) => x.t)).toEqual([0.5])
    expect(q.due(0.45, 0.1)).toEqual([])
    expect(q.due(1.95, 0.1).map((x) => x.t)).toEqual([1, 2])
    expect(q.pending).toBe(0)
  })
  it('dropAfter only removes the items not yet pulled out with t ≥ cut', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1), c(2), c(3), c(4)])
    q.due(1, 0.1)
    q.dropAfter(3)
    expect(q.pending).toBe(1)
    q.add([c(3.5), c(3)])
    expect(q.due(10, 0).map((x) => x.t)).toEqual([2, 3, 3.5])
  })
  it('add with an item in the past relative to the last due: it is queued and pulled out again on the next call, not discarded', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1)])
    expect(q.due(1, 0.1).map((x) => x.t)).toEqual([1])
    expect(q.pending).toBe(0)
    q.add([c(0.5)])
    expect(q.due(1, 0).map((x) => x.t)).toEqual([0.5])
  })
  it('dropAfter cannot take back an item already pulled out by due, even with a cut below its t', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1)])
    expect(q.due(1, 0.1).map((x) => x.t)).toEqual([1])
    expect(q.pending).toBe(0)
    q.dropAfter(0)
    expect(q.pending).toBe(0)
    expect(q.due(10, 0)).toEqual([])
  })
  it('an add that interleaves in the middle of the queue after a partial pull stays in order', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1), c(3), c(5)])
    expect(q.due(1, 0.1).map((x) => x.t)).toEqual([1])
    q.add([c(2), c(4)])
    expect(q.due(10, 0).map((x) => x.t)).toEqual([2, 3, 4, 5])
  })
  it('empty edges: empty queue, add([]), dropAfter before and after everything', () => {
    const q = new ClickQueue<{ t: number }>()
    expect(q.pending).toBe(0)
    expect(q.due(0, 100)).toEqual([])
    q.add([])
    expect(q.pending).toBe(0)

    q.add([c(1), c(2), c(3)])
    q.dropAfter(0)
    expect(q.pending).toBe(0)
    expect(q.due(10, 0)).toEqual([])

    q.add([c(1), c(2), c(3)])
    q.dropAfter(100)
    expect(q.pending).toBe(3)
    expect(q.due(10, 0).map((x) => x.t)).toEqual([1, 2, 3])
  })
})
