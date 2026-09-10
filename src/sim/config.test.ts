import { describe, expect, it } from 'bun:test'
import { parseSynthConfig, SYNTH_LATENCY_MS } from './config'

describe('parseSynthConfig', () => {
  it('is null without a well-formed seed', () => {
    expect(parseSynthConfig('')).toBeNull()
    expect(parseSynthConfig('?player=steady')).toBeNull()
    expect(parseSynthConfig('?synth=abc')).toBeNull()
    expect(parseSynthConfig('?synth=-1')).toBeNull()
    expect(parseSynthConfig('?synth=1234567890')).toBeNull()
  })

  it('defaults to the human preset with headphones on', () => {
    expect(parseSynthConfig('?synth=42')).toEqual({
      seed: 42,
      preset: 'human',
      latencyMs: SYNTH_LATENCY_MS,
      headphones: true,
    })
  })

  it('reads the preset and the headphones flag, and ignores an unknown preset', () => {
    expect(parseSynthConfig('?synth=7&player=sloppy&headphones=off')).toEqual({
      seed: 7,
      preset: 'sloppy',
      latencyMs: SYNTH_LATENCY_MS,
      headphones: false,
    })
    expect(parseSynthConfig('?synth=1&player=nope')?.preset).toBe('human')
  })
})
