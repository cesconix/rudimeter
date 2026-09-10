import { describe, expect, it } from 'bun:test'
import { strokeSamples } from './stroke'

describe('strokeSamples', () => {
  it('holds exactly 1 for the attack and the hold, then stays at or below 1', () => {
    const s = strokeSamples(48000)
    // 80 ms of material at 48 kHz; the plateau covers 0.5 ms of attack + 1.5 ms of hold = 96 samples.
    expect(s.length).toBe(3840)
    const plateau = 96
    for (let i = 0; i < plateau; i++) expect(s[i]).toBe(1)
    let maxTail = 0
    const distinct = new Set<number>()
    for (let i = plateau; i < s.length; i++) {
      maxTail = Math.max(maxTail, Math.abs(s[i]))
      distinct.add(s[i])
    }
    expect(maxTail).toBeLessThanOrEqual(1)
    // Noise, not silence and not a constant.
    expect(maxTail).toBeGreaterThan(0.9)
    expect(distinct.size).toBeGreaterThan(1000)
  })

  it('is the same on every call: the seed is fixed, the waveform is not part of the drummer model', () => {
    expect(strokeSamples(44100)).toEqual(strokeSamples(44100))
    expect(strokeSamples(44100).length).toBe(3528)
    // 0.5 + 1.5 ms at 44.1 kHz = 88.2 → 89 samples of plateau.
    expect(strokeSamples(44100)[88]).toBe(1)
    expect(Math.abs(strokeSamples(44100)[89])).toBeLessThan(1)
  })
})
