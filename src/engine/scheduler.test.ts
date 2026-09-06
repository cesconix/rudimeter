import { describe, expect, it } from 'vitest'
import { dueIndices } from './scheduler'

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
