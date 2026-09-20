import { describe, expect, it } from 'bun:test'
import { SCORES } from '../data/scores'
import { barLength, metersOf } from '../score/events'
import { add, toNumber, ZERO } from '../score/fraction'
import { resolveInstruments } from '../score/instruments'
import type { Bar, Event, InstrumentId, Item, Score } from '../score/types'
import { eventsOf, unroll } from '../score/unroll'
import { type BarLayout, buildLayout, HEAD_PX, LINE_PX, METER_PX, PX_PER_WHOLE, STAFF_TOP } from './layout'
import {
  cursorPoints,
  HIGHLIGHT_PAD,
  type HighlightRect,
  highlightAt,
  highlightRects,
  playbackBarAt,
  transportHighlights,
} from './overlay'

const N = (base: 1 | 2 | 4 | 8 | 16, ids: InstrumentId | InstrumentId[] = 'snare'): Event => ({
  duration: { base },
  notes: (Array.isArray(ids) ? ids : [ids]).map((instrument) => ({ instrument })),
})
const R = (base: 1 | 2 | 4 | 8, hidden = false): Event =>
  hidden ? { duration: { base }, rest: true, hidden: true } : { duration: { base }, rest: true }
const bar = (up: Item[], down?: Item[], extra: Partial<Bar> = {}): Bar => ({
  ...extra,
  parts: {
    kit: {
      voices: down
        ? [
            { stem: 'up', items: up },
            { stem: 'down', items: down },
          ]
        : [{ stem: 'up', items: up }],
    },
  },
})
const piece = (bars: Bar[]): Score => ({
  id: 'p',
  title: 'p',
  parts: [{ id: 'kit', kind: 'drumset' }],
  bars: bars.map((b, i) => (i === 0 && !b.meter ? { meter: [4, 4], ...b } : b)),
})
const q4 = () => [N(4), N(4), N(4), N(4)]
const W = PX_PER_WHOLE
const Q = W / 4

describe('playbackBarAt', () => {
  it('is the last bar starting at or before the position, clamped to the piece', () => {
    const starts = [0, 1, 2]
    expect(playbackBarAt(starts, 0)).toBe(0)
    expect(playbackBarAt(starts, 0.5)).toBe(0)
    expect(playbackBarAt(starts, 1)).toBe(1)
    expect(playbackBarAt(starts, 2.9)).toBe(2)
    expect(playbackBarAt(starts, 5)).toBe(2)
    expect(playbackBarAt(starts, -1)).toBe(0)
  })
})

describe('cursorPoints', () => {
  it('one point per event plus one at each bar end, in playback position, on the bar row', () => {
    const score = piece([bar(q4()), bar(q4())])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const pts = cursorPoints(layout, score, unroll(score))
    expect(pts).toEqual([
      { t: 0, x: HEAD_PX, row: 0 },
      { t: 0.25, x: HEAD_PX + Q, row: 0 },
      { t: 0.5, x: HEAD_PX + 2 * Q, row: 0 },
      { t: 0.75, x: HEAD_PX + 3 * Q, row: 0 },
      // the end of bar 1 is the row's rowEndX; then bar 2 starts again from the left on row 1
      { t: 1, x: HEAD_PX + W, row: 0 },
      { t: 1, x: HEAD_PX, row: 1 },
      { t: 1.25, x: HEAD_PX + Q, row: 1 },
      { t: 1.5, x: HEAD_PX + 2 * Q, row: 1 },
      { t: 1.75, x: HEAD_PX + 3 * Q, row: 1 },
      { t: 2, x: HEAD_PX + W, row: 1 },
    ])
    expect(layout.rows[0].rowEndX).toBe(HEAD_PX + W)
  })

  it('two bars on one row: the end of bar 1 and the start of bar 2 are one point', () => {
    const score = piece([bar(q4()), bar(q4())])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const pts = cursorPoints(layout, score, unroll(score))
    expect(pts.filter((p) => p.t === 1)).toEqual([{ t: 1, x: HEAD_PX + W, row: 0 }])
    expect(pts[pts.length - 1]).toEqual({ t: 2, x: HEAD_PX + 2 * W, row: 0 })
  })

  it('a meter gutter mid-row is two points at the same t: the cursor jumps over it', () => {
    const score = piece([bar(q4()), bar([N(4), N(4), N(4)], undefined, { meter: [3, 4] })])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const pts = cursorPoints(layout, score, unroll(score))
    expect(pts.filter((p) => p.t === 1)).toEqual([
      { t: 1, x: HEAD_PX + W, row: 0 },
      { t: 1, x: HEAD_PX + W + METER_PX, row: 0 },
    ])
  })

  it('two voices at the same instant are one point; a repeat plays the bars again at later t', () => {
    const score = piece([bar(q4(), [N(2, 'kick'), N(2, 'kick')], { repeat: { end: {} } })])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const pts = cursorPoints(layout, score, unroll(score))
    expect(pts.map((p) => p.t)).toEqual([0, 0.25, 0.5, 0.75, 1, 1, 1.25, 1.5, 1.75, 2])
    expect(pts.every((p) => p.row === 0)).toBe(true)
    expect(pts[4]).toEqual({ t: 1, x: HEAD_PX + W, row: 0 })
    expect(pts[5]).toEqual({ t: 1, x: HEAD_PX, row: 0 })
  })

  it('a simile bar has its own points, on its own row, at the source bar x offsets', () => {
    const score = piece([bar(q4()), { simile: true }])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const pts = cursorPoints(layout, score, unroll(score))
    expect(pts.filter((p) => p.row === 1).map((p) => [p.t, p.x])).toEqual([
      [1, HEAD_PX],
      [1.25, HEAD_PX + Q],
      [1.5, HEAD_PX + 2 * Q],
      [1.75, HEAD_PX + 3 * Q],
      [2, HEAD_PX + W],
    ])
  })

  it('no interval of cursorAt crosses rows: a bar-end point closes every emitted bar, whole library', () => {
    for (const score of SCORES) {
      for (const barsPerRow of [1, 2, 4, 8] as const) {
        for (const auto of [true, false]) {
          const layout = buildLayout(score, { barsPerRow, auto })
          const playback = unroll(score)
          const pts = cursorPoints(layout, score, playback)
          const label = `${score.id} barsPerRow=${barsPerRow} auto=${auto}`

          // D3: no adjacent pair straddles a row wrap with a positive-length interval between —
          // that is the wrap branch of `cursorAt`, which needs the view's `rowEndX` (passed as 0
          // here) and would send the cursor backwards instead.
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]
            const b = pts[i]
            expect(a.row !== b.row && a.t < b.t, `${label}: interval [${a.t}, ${b.t}) crosses rows`).toBe(false)
          }

          // Every emitted bar closes with a point at its own right edge, on its own row — the
          // point the cursor slides to during the bar's last event (see cursorPoints' docblock).
          const meters = metersOf(score)
          const barOf = new Map<number, BarLayout>()
          for (const row of layout.rows) for (const b of row.bars) barOf.set(b.barIndex, b)
          let start = ZERO
          for (const pb of playback) {
            const lb = barOf.get(pb.barIndex)
            if (!lb) throw new Error(`${label}: no BarLayout for bar ${pb.barIndex}`)
            const end = add(start, barLength(meters[pb.barIndex]))
            const t = toNumber(end)
            const row = layout.rowOfBar[pb.barIndex]
            const found = pts.some((p) => p.t === t && p.x === lb.x + lb.width && p.row === row)
            expect(found, `${label}: bar ${pb.barIndex} (pass ${pb.pass}) has no end point at t=${t}`).toBe(true)
            start = end
          }
        }
      }
    }
  })
})

describe('highlightAt / transportHighlights', () => {
  const groove = piece([
    bar(
      [N(8, 'hihat'), N(8, 'hihat'), N(8, ['hihat', 'snare']), N(8, 'hihat'), N(4), N(4)],
      [N(4, 'kick'), R(4, true), N(4, 'kick'), R(4)],
    ),
  ])
  const events = eventsOf(groove, unroll(groove))

  it('every non-hidden event whose [start, end) holds the position: one per voice', () => {
    expect(highlightAt(events, 0)).toEqual(['b0/kit/0/0@1', 'b0/kit/1/0@1'])
    expect(highlightAt(events, 0.125)).toEqual(['b0/kit/0/1@1', 'b0/kit/1/0@1'])
    // the feet's hidden rest on beat 2 is never highlighted
    expect(highlightAt(events, 0.25)).toEqual(['b0/kit/0/2@1'])
    expect(highlightAt(events, 0.3)).toEqual(['b0/kit/0/2@1'])
    // a drawn rest is
    expect(highlightAt(events, 0.75)).toEqual(['b0/kit/0/5@1', 'b0/kit/1/3@1'])
  })

  it('at the end of the piece nothing sounds', () => {
    expect(highlightAt(events, 1)).toEqual([])
  })

  it('a repeat carries the pass in the key', () => {
    const twice = piece([bar(q4(), undefined, { repeat: { end: {} } })])
    const ev = eventsOf(twice, unroll(twice))
    expect(highlightAt(ev, 1.5)).toEqual(['b0/kit/0/2@2'])
  })

  it('transportHighlights is the same answer, precomputed', () => {
    const source = transportHighlights(events)
    for (const pos of [0, 0.125, 0.25, 0.5, 0.75, 0.99]) expect(source(pos)).toEqual(highlightAt(events, pos))
  })

  it('tuplet boundaries are exact: the third triplet eighth starts where the second ends', () => {
    const trip = piece([bar([{ tuplet: { actual: 3, normal: 2 }, items: [N(8), N(8), N(8)] }, N(4), N(4), N(4)])])
    const ev = eventsOf(trip, unroll(trip))
    expect(highlightAt(ev, toNumber(ev[2].position))).toEqual(['b0/kit/0/0.2@1'])
  })
})

describe('highlightRects', () => {
  const y = (line: number) => STAFF_TOP + (4 - line) * LINE_PX
  const catalogue = resolveInstruments({})

  it('the event slice of the time grid, from the highest head to the lowest, padded', () => {
    const score = piece([bar([N(4), N(4, ['hihat', 'snare']), N(2, 'kick')])])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const rects = highlightRects(score, catalogue, layout, unroll(score))
    // snare on line 2.5
    expect(rects.get('b0/kit/0/0@1')).toEqual({
      row: 0,
      x: HEAD_PX - HIGHLIGHT_PAD,
      width: Q + 2 * HIGHLIGHT_PAD,
      y: y(2.5) - LINE_PX / 2 - HIGHLIGHT_PAD,
      height: LINE_PX + 2 * HIGHLIGHT_PAD,
    })
    // hi-hat (4.5) over snare (2.5): one box from the top head to the bottom one
    const chord = rects.get('b0/kit/0/1@1')
    expect(chord?.y).toBe(y(4.5) - LINE_PX / 2 - HIGHLIGHT_PAD)
    expect(chord?.height).toBe(y(2.5) + LINE_PX / 2 + HIGHLIGHT_PAD - (y(4.5) - LINE_PX / 2 - HIGHLIGHT_PAD))
    // a half note's slice is half the bar
    expect(rects.get('b0/kit/0/2@1')?.width).toBe(W / 2 + 2 * HIGHLIGHT_PAD)
  })

  it('rests sit on their rest line: middle alone, up and down with two voices; hidden rests have no rect', () => {
    const score = piece([bar([N(4), R(4), N(2)]), bar([R(2), N(2)], [N(2, 'kick'), R(4), R(4, true)])])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const rects = highlightRects(score, catalogue, layout, unroll(score))
    expect(rects.get('b0/kit/0/1@1')?.y).toBe(y(2) - LINE_PX / 2 - HIGHLIGHT_PAD)
    expect(rects.get('b1/kit/0/0@1')?.y).toBe(y(3) - LINE_PX / 2 - HIGHLIGHT_PAD)
    expect(rects.get('b1/kit/1/1@1')?.y).toBe(y(1) - LINE_PX / 2 - HIGHLIGHT_PAD)
    expect(rects.has('b1/kit/1/2@1')).toBe(false)
  })

  it('every pass of a repeat has its rects, and a simile bar has the source bar rects under its own index', () => {
    const score = piece([bar(q4(), undefined, { repeat: { end: {} } }), { simile: true }])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const playback = unroll(score)
    const rects = highlightRects(score, catalogue, layout, playback)
    expect(playback.map((pb) => [pb.barIndex, pb.pass])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
    ])
    expect(rects.get('b0/kit/0/0@2')?.row).toBe(0)
    expect(rects.get('b1/kit/0/3@1')).toEqual({ ...(rects.get('b0/kit/0/3@1') as HighlightRect), row: 1 })
    expect(rects.size).toBe(12)
  })
})
