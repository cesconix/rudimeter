import { describe, expect, it } from 'vitest'
import { ClickQueue, dueIndices } from './scheduler'

describe('dueIndices', () => {
  const times = [1, 1.5, 2, 2.5, 3]
  it('ritorna gli indici con tempo < now + lookahead a partire da from', () => {
    expect(dueIndices(times, 0, 0.95, 0.1)).toEqual({ indices: [0], next: 1 })
    expect(dueIndices(times, 1, 1.45, 0.1)).toEqual({ indices: [1], next: 2 })
    expect(dueIndices(times, 2, 2.6, 0.1)).toEqual({ indices: [2, 3], next: 4 })
  })
  it('niente da schedulare: indici vuoti, from invariato', () => {
    expect(dueIndices(times, 2, 1.0, 0.1)).toEqual({ indices: [], next: 2 })
    expect(dueIndices(times, 5, 99, 0.1)).toEqual({ indices: [], next: 5 })
  })
})

describe('ClickQueue', () => {
  const c = (t: number) => ({ t })
  it('estrae in ordine ciò che cade nel lookahead e non lo riestrae', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1), c(0.5), c(2)])
    expect(q.due(0.45, 0.1).map((x) => x.t)).toEqual([0.5])
    expect(q.due(0.45, 0.1)).toEqual([])
    expect(q.due(1.95, 0.1).map((x) => x.t)).toEqual([1, 2])
    expect(q.pending).toBe(0)
  })
  it('dropAfter toglie solo gli item non ancora estratti con t ≥ taglio', () => {
    const q = new ClickQueue<{ t: number }>()
    q.add([c(1), c(2), c(3), c(4)])
    q.due(1, 0.1)
    q.dropAfter(3)
    expect(q.pending).toBe(1)
    q.add([c(3.5), c(3)])
    expect(q.due(10, 0).map((x) => x.t)).toEqual([2, 3, 3.5])
  })
})
