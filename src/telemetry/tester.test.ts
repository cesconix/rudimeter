import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import { forgetTester, readTester, rememberTester, TESTER_STORAGE_KEY, withoutTester } from './tester'

const KEY = 'a'.repeat(32)

describe('readTester', () => {
  it('takes the key from the URL and stores it, name unknown', () => {
    const s = memoryStore()
    expect(readTester(`?synth=42&tester=${KEY}`, s)).toEqual({ key: KEY, name: null })
    expect(JSON.parse(s.getItem(TESTER_STORAGE_KEY) ?? '')).toEqual({ key: KEY, name: null })
  })
  it('falls back to the stored one, with its name; ignores a malformed key or a broken record', () => {
    const s = memoryStore()
    rememberTester(s, { key: KEY, name: 'marco' })
    expect(readTester('?tester=nope', s)).toEqual({ key: KEY, name: 'marco' })
    expect(readTester('', s)).toEqual({ key: KEY, name: 'marco' })
    s.setItem(TESTER_STORAGE_KEY, '{oops')
    expect(readTester('', s)).toBeNull()
    s.setItem(TESTER_STORAGE_KEY, JSON.stringify({ key: 'short' }))
    expect(readTester('', s)).toBeNull()
    expect(readTester('', memoryStore())).toBeNull()
  })
  it('forgets', () => {
    const s = memoryStore()
    rememberTester(s, { key: KEY, name: null })
    forgetTester(s)
    expect(readTester('', s)).toBeNull()
  })
  it('withoutTester drops only the key', () => {
    expect(withoutTester(`https://rudimeter.com/?tester=${KEY}&synth=42`)).toBe('https://rudimeter.com/?synth=42')
    expect(withoutTester('https://rudimeter.com/')).toBe('https://rudimeter.com/')
  })
})
