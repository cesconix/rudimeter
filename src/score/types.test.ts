import { describe, expect, it } from 'bun:test'
import { isTuplet } from './types'

describe('isTuplet', () => {
  it('tells a tuplet group from an event', () => {
    expect(isTuplet({ tuplet: { actual: 3, normal: 2 }, items: [] })).toBe(true)
    expect(isTuplet({ duration: { base: 8 }, rest: true })).toBe(false)
  })
})
