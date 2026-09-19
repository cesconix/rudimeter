import { describe, expect, it } from 'bun:test'
import { CATALOGUE, INSTRUMENT_IDS, resolveInstruments } from './instruments'

describe('CATALOGUE', () => {
  it('follows the PAS / Weinberg positions', () => {
    expect(CATALOGUE.kick).toEqual({ line: 0.5, head: 'normal', stem: 'down', name: 'Bass drum' })
    expect(CATALOGUE.snare.line).toBe(2.5)
    expect(CATALOGUE.hihat).toEqual({ line: 4.5, head: 'x', stem: 'up', name: 'Hi-hat' })
    expect(CATALOGUE['hihat-pedal']).toEqual({ line: -0.5, head: 'x', stem: 'down', name: 'Hi-hat (foot)' })
    expect(CATALOGUE.crash.line).toBe(5)
    expect(CATALOGUE['ride-bell'].head).toBe('diamond')
    expect(INSTRUMENT_IDS).toHaveLength(12)
  })
})

describe('resolveInstruments', () => {
  it('returns the catalogue when the piece overrides nothing', () => {
    expect(resolveInstruments({})).toEqual(CATALOGUE)
  })
  it('merges an override field by field and leaves the rest alone', () => {
    const merged = resolveInstruments({
      instruments: { kick: { line: 0 }, ride: { head: 'normal', name: 'Ride (book)' } },
    })
    expect(merged.kick).toEqual({ line: 0, head: 'normal', stem: 'down', name: 'Bass drum' })
    expect(merged.ride).toEqual({ line: 4, head: 'normal', stem: 'up', name: 'Ride (book)' })
    expect(merged.snare).toBe(CATALOGUE.snare)
    // The catalogue itself is never touched.
    expect(CATALOGUE.kick.line).toBe(0.5)
  })
})
