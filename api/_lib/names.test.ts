import { describe, expect, it } from 'bun:test'
import { isKey, newKey, safeName } from './names'

describe('safeName', () => {
  it('lowercase letters, digits and dashes only, never empty', () => {
    expect(safeName('iPhone di Francesco')).toBe('iphone-di-francesco')
    expect(safeName('../..')).toBe('device')
    expect(safeName('a'.repeat(60))).toHaveLength(40)
  })
})

describe('newKey / isKey', () => {
  it('is 32 lowercase hex chars, different every time', () => {
    const a = newKey()
    expect(isKey(a)).toBe(true)
    expect(a).not.toBe(newKey())
    expect(isKey('abc')).toBe(false)
    expect(isKey(`${a.slice(0, 31)}G`)).toBe(false)
  })
})
