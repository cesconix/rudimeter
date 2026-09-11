import { describe, expect, it } from 'bun:test'
import { encodeWav } from './wav'

describe('encodeWav', () => {
  it('writes a 44-byte header and 16-bit little-endian samples', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 48000)
    expect(wav).toHaveLength(44 + 5 * 2)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
    const v = new DataView(wav.buffer)
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(10)
    expect(v.getInt16(44, true)).toBe(0)
    expect(v.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff))
    expect(v.getInt16(48, true)).toBe(-0x4000)
    expect(v.getInt16(50, true)).toBe(0x7fff)
    expect(v.getInt16(52, true)).toBe(-0x8000)
  })
  it('clips beyond ±1 instead of wrapping', () => {
    const wav = encodeWav(new Float32Array([2, -2]), 8000)
    const v = new DataView(wav.buffer)
    expect(v.getInt16(44, true)).toBe(0x7fff)
    expect(v.getInt16(46, true)).toBe(-0x8000)
  })
})
