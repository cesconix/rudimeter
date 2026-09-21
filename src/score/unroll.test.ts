import { describe, expect, it } from 'bun:test'
import { frac } from './fraction'
import type { Bar, Event, Score } from './types'
import { barStarts, eventsOf, unroll } from './unroll'

const q = (): Event => ({ duration: { base: 4 } })
/** A 2/4 bar of two quarters, with whatever bar-level fields the test needs. */
const bar = (extra: Partial<Bar> = {}): Bar => ({ ...extra, items: [q(), q()] })
const score = (bars: Bar[]): Score => {
  bars[0].meter = [2, 4]
  return { id: 't', title: 't', bars }
}
const walk = (bars: Bar[]) => unroll(score(bars)).map((p) => `${p.barIndex}@${p.pass}`)

describe('unroll', () => {
  it('is the identity without repeats', () => {
    expect(walk([bar(), bar(), bar()])).toEqual(['0@1', '1@1', '2@1'])
  })
  it('plays a plain repeat twice, and `times` as asked', () => {
    expect(walk([bar({ repeat: { start: true } }), bar({ repeat: { end: {} } }), bar()])).toEqual([
      '0@1',
      '1@1',
      '0@2',
      '1@2',
      '2@1',
    ])
    expect(walk([bar({ repeat: { start: true, end: { times: 3 } } })])).toEqual(['0@1', '0@2', '0@3'])
  })
  it('goes back to the bar after the previous section when a repeat.end has no repeat.start', () => {
    // 50 Workout #43: bars 1–4 repeat, then 5–16 repeat with no sign at bar 5.
    const bars = [bar({ repeat: { start: true } }), bar({ repeat: { end: {} } }), bar(), bar({ repeat: { end: {} } })]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '1@2', '2@1', '3@1', '2@2', '3@2'])
  })
  it('a start sign after a section opens a new one from pass 1, with its own times', () => {
    const bars = [
      bar({ repeat: { start: true } }),
      bar({ repeat: { end: {} } }),
      bar({ repeat: { start: true } }),
      bar({ repeat: { end: { times: 3 } } }),
    ]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '1@2', '2@1', '3@1', '2@2', '3@2', '2@3', '3@3'])
  })
  it('a section played three times, then one with no start sign played twice', () => {
    const bars = [
      bar({ repeat: { start: true } }),
      bar({ repeat: { end: { times: 3 } } }),
      bar(),
      bar({ repeat: { end: {} } }),
    ]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '1@2', '0@3', '1@3', '2@1', '3@1', '2@2', '3@2'])
  })
})

describe('eventsOf / barStarts', () => {
  it('lays the events of every pass end to end, tuplets opened, with playback keys', () => {
    const s: Score = {
      id: 't',
      title: 't',
      bars: [
        { meter: [2, 4], repeat: { start: true, end: {} }, items: [q(), { duration: { base: 4 }, rest: true }] },
        {
          items: [
            {
              tuplet: { actual: 3, normal: 2 },
              items: [{ duration: { base: 8 } }, { duration: { base: 8 } }, { duration: { base: 8 } }],
            },
            q(),
          ],
        },
      ],
    }
    const playback = unroll(s)
    expect(playback).toEqual([
      { barIndex: 0, pass: 1 },
      { barIndex: 0, pass: 2 },
      { barIndex: 1, pass: 1 },
    ])
    const events = eventsOf(s, playback)
    expect(events.map((e) => [e.key, e.position, e.length, e.rest])).toEqual([
      ['b0/0@1', frac(0), frac(1, 4), false],
      ['b0/1@1', frac(1, 4), frac(1, 4), true],
      ['b0/0@2', frac(1, 2), frac(1, 4), false],
      ['b0/1@2', frac(3, 4), frac(1, 4), true],
      ['b1/0.0@1', frac(1), frac(1, 12), false],
      ['b1/0.1@1', frac(13, 12), frac(1, 12), false],
      ['b1/0.2@1', frac(7, 6), frac(1, 12), false],
      ['b1/1@1', frac(5, 4), frac(1, 4), false],
    ])
    expect(events[0].id).toEqual({ bar: 0, item: 0 })
    expect(events[4].id).toEqual({ bar: 1, item: 0, sub: 0 })
    expect(events[4].pass).toBe(1)
    expect(barStarts(s, playback)).toEqual([frac(0), frac(1, 2), frac(1)])
  })
})
