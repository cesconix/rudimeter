import { describe, expect, it } from 'bun:test'
import { clickOptionsFor } from './click'

describe('clickOptionsFor', () => {
  it('bar è più acuto e più forte di beat; beat più acuto e più forte di sub (il vincolo dello spec)', () => {
    const bar = clickOptionsFor('bar')
    const beat = clickOptionsFor('beat')
    const sub = clickOptionsFor('sub')
    expect(bar.freq!).toBeGreaterThan(beat.freq!)
    expect(beat.freq!).toBeGreaterThan(sub.freq!)
    expect(bar.gain!).toBeGreaterThan(beat.gain!)
    expect(beat.gain!).toBeGreaterThan(sub.gain!)
  })
  it('valori esatti per ciascun kind', () => {
    expect(clickOptionsFor('bar')).toEqual({ freq: 1500, gain: 0.6 })
    expect(clickOptionsFor('beat')).toEqual({ freq: 1000, gain: 0.5 })
    expect(clickOptionsFor('sub')).toEqual({ freq: 800, gain: 0.25 })
  })
})
