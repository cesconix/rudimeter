import { describe, expect, it } from 'bun:test'
import { keyOf, parseKey, playbackKey } from './ids'

describe('event keys', () => {
  it('round-trips with and without a tuplet position', () => {
    const plain = { bar: 3, part: 'kit', voice: 0, item: 2 }
    const inTuplet = { bar: 3, part: 'kit', voice: 1, item: 2, sub: 1 }
    expect(keyOf(plain)).toBe('b3/kit/0/2')
    expect(keyOf(inTuplet)).toBe('b3/kit/1/2.1')
    expect(parseKey('b3/kit/0/2')).toEqual(plain)
    expect(parseKey('b3/kit/1/2.1')).toEqual(inTuplet)
  })
  it('adds the pass for playback', () => {
    expect(playbackKey({ bar: 0, part: 'pad', voice: 0, item: 0 }, 2)).toBe('b0/pad/0/0@2')
  })
  it('rejects a malformed key', () => {
    expect(() => parseKey('3/kit/0/2')).toThrow('invalid event key: "3/kit/0/2"')
    expect(() => parseKey('b3/kit/0/2@1')).toThrow('invalid event key')
  })
})
