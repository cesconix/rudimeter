import { describe, expect, it } from 'bun:test'
import { frac } from './fraction'
import type { Bar, Event, Score } from './types'
import { barStarts, eventsOf, sections, unroll } from './unroll'

const q = (): Event => ({ duration: { base: 4 }, notes: [{ instrument: 'snare' }] })
/** A 2/4 bar of two quarters on the pad, with whatever bar-level fields the test needs. */
const bar = (extra: Partial<Bar> = {}): Bar => ({
  ...extra,
  parts: { pad: { voices: [{ stem: 'up', items: [q(), q()] }] } },
})
const score = (bars: Bar[]): Score => {
  bars[0].meter = [2, 4]
  return { id: 't', title: 't', parts: [{ id: 'pad', kind: 'drumset' }], bars }
}
const walk = (bars: Bar[]) =>
  unroll(score(bars)).map(
    (p) => `${p.barIndex}@${p.pass}${p.sourceBarIndex !== p.barIndex ? `<${p.sourceBarIndex}` : ''}`,
  )

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
  it('takes the first ending on pass 1 and the second on pass 2', () => {
    const bars = [
      bar({ repeat: { start: true } }),
      bar({ ending: [1], repeat: { end: {} } }),
      bar({ ending: [2] }),
      bar(),
    ]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '2@2', '3@1'])
  })
  it('lets an ending cover several passes', () => {
    const bars = [
      bar({ repeat: { start: true } }),
      bar({ ending: [1, 2], repeat: { end: { times: 3 } } }),
      bar({ ending: [3] }),
      bar(),
    ]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '1@2', '0@3', '2@3', '3@1'])
  })
  it('goes back to the bar after the previous section when a repeat.end has no repeat.start', () => {
    // 50 Workout #43: bars 1–4 repeat, then 5–16 repeat with no sign at bar 5.
    const bars = [bar({ repeat: { start: true } }), bar({ repeat: { end: {} } }), bar(), bar({ repeat: { end: {} } })]
    expect(walk(bars)).toEqual(['0@1', '1@1', '0@2', '1@2', '2@1', '3@1', '2@2', '3@2'])
  })
  it('points a simile bar at the last written bar, through a chain', () => {
    expect(walk([bar(), { simile: true }, { simile: true }, bar()])).toEqual(['0@1', '1@1<0', '2@1<0', '3@1'])
  })
})

describe('sections', () => {
  it('lists every repeated section with its times', () => {
    const bars = [
      bar({ repeat: { start: true } }),
      bar({ repeat: { end: { times: 3 } } }),
      bar(),
      bar({ repeat: { end: {} } }),
    ]
    expect(sections(score(bars))).toEqual([
      { start: 0, end: 1, times: 3 },
      { start: 2, end: 3, times: 2 },
    ])
    expect(sections(score([bar(), bar()]))).toEqual([])
  })
})

describe('eventsOf / barStarts', () => {
  it('lays the events of every pass end to end, both voices, with playback keys', () => {
    const kit: Bar = {
      meter: [2, 4],
      repeat: { start: true, end: {} },
      parts: {
        kit: {
          voices: [
            { stem: 'up', items: [q(), { duration: { base: 4 }, rest: true }] },
            { stem: 'down', items: [{ duration: { base: 2 }, rest: true, hidden: true }] },
          ],
        },
      },
    }
    const s: Score = { id: 't', title: 't', parts: [{ id: 'kit', kind: 'drumset' }], bars: [kit, { simile: true }] }
    const playback = unroll(s)
    expect(playback).toEqual([
      { barIndex: 0, pass: 1, sourceBarIndex: 0 },
      { barIndex: 0, pass: 2, sourceBarIndex: 0 },
      { barIndex: 1, pass: 1, sourceBarIndex: 0 },
    ])
    const events = eventsOf(s, playback)
    expect(events.map((e) => [e.key, e.position, e.length, e.rest, e.hidden])).toEqual([
      ['b0/kit/0/0@1', frac(0), frac(1, 4), false, false],
      ['b0/kit/0/1@1', frac(1, 4), frac(1, 4), true, false],
      ['b0/kit/1/0@1', frac(0), frac(1, 2), true, true],
      ['b0/kit/0/0@2', frac(1, 2), frac(1, 4), false, false],
      ['b0/kit/0/1@2', frac(3, 4), frac(1, 4), true, false],
      ['b0/kit/1/0@2', frac(1, 2), frac(1, 2), true, true],
      // The simile bar's events carry the simile bar's index: that is the bar the highlight lands on.
      ['b1/kit/0/0@1', frac(1), frac(1, 4), false, false],
      ['b1/kit/0/1@1', frac(5, 4), frac(1, 4), true, false],
      ['b1/kit/1/0@1', frac(1), frac(1, 2), true, true],
    ])
    expect(events[0].id).toEqual({ bar: 0, part: 'kit', voice: 0, item: 0 })
    expect(barStarts(s, playback)).toEqual([frac(0), frac(1, 2), frac(1)])
  })
})
