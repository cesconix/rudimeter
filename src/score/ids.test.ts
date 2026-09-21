import { describe, expect, it } from 'bun:test'
import { keyOf, parseKey, playbackKey } from './ids'

describe('event keys', () => {
  it('round-trips with and without a tuplet position', () => {
    const plain = { bar: 3, item: 2 }
    const inTuplet = { bar: 3, item: 2, sub: 1 }
    expect(keyOf(plain)).toBe('b3/2')
    expect(keyOf(inTuplet)).toBe('b3/2.1')
    expect(parseKey('b3/2')).toEqual(plain)
    expect(parseKey('b3/2.1')).toEqual(inTuplet)
  })
  it('adds the pass for playback', () => {
    expect(playbackKey({ bar: 0, item: 0 }, 2)).toBe('b0/0@2')
  })
  it('rejects a malformed key, the kit shape included', () => {
    expect(() => parseKey('3/2')).toThrow('invalid event key: "3/2"')
    expect(() => parseKey('b3/2@1')).toThrow('invalid event key')
    expect(() => parseKey('b3/pad/0/2')).toThrow('invalid event key')
    expect(() => parseKey('b3/2.')).toThrow('invalid event key')
  })
})
