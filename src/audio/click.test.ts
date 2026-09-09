import { describe, expect, it } from 'bun:test'
import { clickOptionsFor } from './click'

describe('clickOptionsFor', () => {
  it('bar is higher and louder than beat; beat higher and louder than sub (the spec constraint)', () => {
    const bar = clickOptionsFor('bar')
    const beat = clickOptionsFor('beat')
    const sub = clickOptionsFor('sub')
    // biome-ignore lint/style/noNonNullAssertion: clickOptionsFor always sets freq and gain, and asserting on them is the point of this test.
    expect(bar.freq!).toBeGreaterThan(beat.freq!)
    // biome-ignore lint/style/noNonNullAssertion: clickOptionsFor always sets freq and gain, and asserting on them is the point of this test.
    expect(beat.freq!).toBeGreaterThan(sub.freq!)
    // biome-ignore lint/style/noNonNullAssertion: clickOptionsFor always sets freq and gain, and asserting on them is the point of this test.
    expect(bar.gain!).toBeGreaterThan(beat.gain!)
    // biome-ignore lint/style/noNonNullAssertion: clickOptionsFor always sets freq and gain, and asserting on them is the point of this test.
    expect(beat.gain!).toBeGreaterThan(sub.gain!)
  })
  it('exact values for each kind', () => {
    expect(clickOptionsFor('bar')).toEqual({ freq: 1500, gain: 0.6 })
    expect(clickOptionsFor('beat')).toEqual({ freq: 1000, gain: 0.5 })
    expect(clickOptionsFor('sub')).toEqual({ freq: 800, gain: 0.25 })
  })
})
