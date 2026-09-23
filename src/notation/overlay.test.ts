import { describe, expect, it } from 'bun:test'
import { SCORES } from '../data/scores'
import { barLength, metersOf } from '../score/events'
import { add, toNumber, ZERO } from '../score/fraction'
import type { Bar, Event, Item, NoteBase, Score } from '../score/types'
import { eventsOf, unroll } from '../score/unroll'
import {
  BAR_PAD,
  buildLayout,
  CLEF_PX,
  DRAG_PX,
  HEAD_INK,
  HEAD_PX,
  type Layout,
  LINE_PX,
  METER_PX,
  PX_PER_WHOLE,
  REST_INK,
  restLine,
  SNARE_LINE,
} from './layout'
import { cursorPoints, HIGHLIGHT_PAD, highlightAt, highlightRects, playbackBarAt, transportHighlights } from './overlay'

const N = (base: NoteBase, extra: Partial<Event> = {}): Event => ({ duration: { base }, ...extra })
const R = (base: NoteBase): Event => ({ duration: { base }, rest: true })
const bar = (items: Item[], extra: Partial<Bar> = {}): Bar => ({ ...extra, items })
const piece = (bars: Bar[]): Score => ({
  id: 'p',
  title: 'p',
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
    const pts = cursorPoints(layout, score)
    expect(pts).toEqual([
      { t: 0, x: HEAD_PX, row: 0 },
      { t: 0.25, x: HEAD_PX + Q, row: 0 },
      { t: 0.5, x: HEAD_PX + 2 * Q, row: 0 },
      { t: 0.75, x: HEAD_PX + 3 * Q, row: 0 },
      // the end of bar 1 is the row's rowEndX; then bar 2 starts again from the left on row 1, after the clef alone
      { t: 1, x: HEAD_PX + W, row: 0 },
      { t: 1, x: CLEF_PX, row: 1 },
      { t: 1.25, x: CLEF_PX + Q, row: 1 },
      { t: 1.5, x: CLEF_PX + 2 * Q, row: 1 },
      { t: 1.75, x: CLEF_PX + 3 * Q, row: 1 },
      { t: 2, x: CLEF_PX + W, row: 1 },
    ])
    expect(layout.rows[0].rowEndX).toBe(HEAD_PX + W)
  })

  it('two bars on one row: the end of bar 1 slides through the pad to the start of bar 2, one point', () => {
    const score = piece([bar(q4()), bar(q4())])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const pts = cursorPoints(layout, score)
    // Not the barline (HEAD_PX + W): the end point sits on bar 2's grid start, so the last quarter's
    // slide covers the barline and the pad; bar 2's first event lands on the same point right after it.
    expect(pts.filter((p) => p.t === 1)).toEqual([
      { t: 1, x: HEAD_PX + W + BAR_PAD, row: 0 },
      { t: 1, x: HEAD_PX + W + BAR_PAD, row: 0 },
    ])
    expect(pts[pts.length - 1]).toEqual({ t: 2, x: HEAD_PX + 2 * W + BAR_PAD, row: 0 })
  })

  it('a repeat is drawn out: every pass has its own x, and the end of a pass slides into the next copy like any bar on the row', () => {
    // Drawn: bar 1, bar 2, bar 1 again, bar 2 again, bar 3 — five bars on one row, plain barlines.
    const score = piece([bar(q4(), { repeat: { start: true } }), bar(q4(), { repeat: { end: {} } }), bar(q4())])
    const layout = buildLayout(score, { barsPerRow: 8, auto: true })
    const pts = cursorPoints(layout, score)
    const x = (drawn: number) => HEAD_PX + drawn * (W + BAR_PAD)
    expect(pts.filter((p) => p.t === 2)).toEqual([
      { t: 2, x: x(2), row: 0 },
      { t: 2, x: x(2), row: 0 },
    ])
    expect(pts.filter((p) => p.t === 4)).toEqual([
      { t: 4, x: x(4), row: 0 },
      { t: 4, x: x(4), row: 0 },
    ])
    expect(pts[pts.length - 1]).toEqual({ t: 5, x: x(4) + W, row: 0 })
    // On one row the cursor only ever goes right: no jump back, nothing to scroll up to.
    for (let i = 1; i < pts.length; i++) expect(pts[i].x).toBeGreaterThanOrEqual(pts[i - 1].x)
  })

  it('the slide crosses any head that draws no signature: a drag on the downbeat', () => {
    const score = piece([bar(q4()), bar([N(4, { grace: { kind: 'drag' } }), N(4), N(4), N(4)])])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const pts = cursorPoints(layout, score)
    const bar2 = HEAD_PX + W + BAR_PAD + DRAG_PX
    expect(pts.filter((p) => p.t === 1)).toEqual([
      { t: 1, x: bar2, row: 0 },
      { t: 1, x: bar2, row: 0 },
    ])
  })

  it('a meter gutter mid-row is two points at the same t: the cursor jumps over it', () => {
    const score = piece([bar(q4()), bar([N(4), N(4), N(4)], { meter: [3, 4] })])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const pts = cursorPoints(layout, score)
    expect(pts.filter((p) => p.t === 1)).toEqual([
      { t: 1, x: HEAD_PX + W, row: 0 },
      { t: 1, x: HEAD_PX + W + METER_PX, row: 0 },
    ])
  })

  it('one bar per row: the second pass of a repeated bar is drawn on its own row, after the clef alone', () => {
    const score = piece([bar(q4(), { repeat: { end: {} } })])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const pts = cursorPoints(layout, score)
    expect(pts.map((p) => p.t)).toEqual([0, 0.25, 0.5, 0.75, 1, 1, 1.25, 1.5, 1.75, 2])
    expect(pts.map((p) => p.row)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
    expect(pts[4]).toEqual({ t: 1, x: HEAD_PX + W, row: 0 })
    expect(pts[5]).toEqual({ t: 1, x: CLEF_PX, row: 1 })
    expect(pts[9]).toEqual({ t: 2, x: CLEF_PX + W, row: 1 })
  })

  it('the points never go back in time and no interval crosses rows: a bar-end point closes every emitted bar, whole library', () => {
    for (const score of SCORES) {
      for (const barsPerRow of [1, 2, 4, 8] as const) {
        for (const auto of [true, false]) {
          const layout = buildLayout(score, { barsPerRow, auto })
          const playback = unroll(score)
          const pts = cursorPoints(layout, score)
          const label = `${score.id} barsPerRow=${barsPerRow} auto=${auto}`

          // Time order by construction — one voice, walked bar by bar in playback order — with no
          // sort behind it: `cursorAt` binary-searches on `t`.
          for (let i = 1; i < pts.length; i++)
            expect(pts[i].t >= pts[i - 1].t, `${label}: t goes back at ${i}`).toBe(true)

          // D3: no adjacent pair straddles a row wrap with a positive-length interval between —
          // that is the wrap branch of `cursorAt`, which needs the view's `rowEndX` (passed as 0
          // there) and would send the cursor backwards instead.
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]
            const b = pts[i]
            expect(a.row !== b.row && a.t < b.t, `${label}: interval [${a.t}, ${b.t}) crosses rows`).toBe(false)
          }

          // Every drawn bar closes with a point at its own right edge, on its own row — the point
          // the cursor slides to during the bar's last event (see cursorPoints' docblock) — or, when
          // the next drawn bar follows on the same row behind nothing but the pad, at that bar's
          // grid start. Drawn out, a pass boundary is a barline like any other.
          const meters = metersOf(score)
          const bars = layout.rows.flatMap((row) => row.bars)
          expect(layout.playback, label).toEqual(playback)
          let start = ZERO
          playback.forEach((pb, i) => {
            const lb = bars[i]
            const end = add(start, barLength(meters[pb.barIndex]))
            const t = toNumber(end)
            const row = layout.rowOfPlayback[i]
            const nb = bars[i + 1]
            const endX = nb && layout.rowOfPlayback[i + 1] === row && !nb.showMeter ? nb.x : lb.x + lb.width
            const found = pts.some((p) => p.t === t && p.x === endX && p.row === row)
            expect(
              found,
              `${label}: drawn bar ${i} (bar ${pb.barIndex}, pass ${pb.pass}) has no end point at t=${t}`,
            ).toBe(true)
            start = end
          })

          // Inside a row the cursor only goes right: the page is drawn out, nothing jumps back.
          for (let i = 1; i < pts.length; i++) {
            if (pts[i].row === pts[i - 1].row)
              expect(pts[i].x >= pts[i - 1].x, `${label}: x goes back at ${i}`).toBe(true)
          }
        }
      }
    }
  })
})

describe('highlightAt / transportHighlights', () => {
  const study = piece([bar([N(8), N(8), N(8, { accent: true }), N(8), N(4), R(4)])])
  const events = eventsOf(study, unroll(study))

  it('the one event whose [start, end) holds the position; a rest too', () => {
    expect(highlightAt(events, 0)).toEqual(['b0/0@1'])
    expect(highlightAt(events, 0.125)).toEqual(['b0/1@1'])
    expect(highlightAt(events, 0.25)).toEqual(['b0/2@1'])
    expect(highlightAt(events, 0.3)).toEqual(['b0/2@1'])
    expect(highlightAt(events, 0.5)).toEqual(['b0/4@1'])
    expect(highlightAt(events, 0.75)).toEqual(['b0/5@1'])
  })

  it('at the end of the piece nothing sounds', () => {
    expect(highlightAt(events, 1)).toEqual([])
  })

  it('a repeat carries the pass in the key', () => {
    const twice = piece([bar(q4(), { repeat: { end: {} } })])
    const ev = eventsOf(twice, unroll(twice))
    expect(highlightAt(ev, 1.5)).toEqual(['b0/2@2'])
  })

  it('transportHighlights is the same answer, precomputed', () => {
    const source = transportHighlights(events)
    for (const pos of [0, 0.125, 0.25, 0.5, 0.75, 0.99]) expect(source(pos)).toEqual(highlightAt(events, pos))
  })

  it('tuplet boundaries are exact: the third triplet eighth starts where the second ends', () => {
    const trip = piece([bar([{ tuplet: { actual: 3, normal: 2 }, items: [N(8), N(8), N(8)] }, N(4), N(4), N(4)])])
    const ev = eventsOf(trip, unroll(trip))
    expect(highlightAt(ev, toNumber(ev[2].position))).toEqual(['b0/0.2@1'])
  })
})

describe('highlightRects', () => {
  // From the piece's band: the staff sits where its tallest ink leaves it (`rowBand`).
  const y = (layout: Layout, line: number) => layout.staffTop + (4 - line) * LINE_PX

  it("a stroke's box frames its head on the snare's line, a rest's the rest on its line, padded — never the event's time", () => {
    const score = piece([bar([N(4), R(4), N(2)])])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const rects = highlightRects(score, layout)
    const head = HEAD_INK[4]
    expect(rects.get('b0/0@1')).toEqual({
      row: 0,
      x: HEAD_PX + head.left - HIGHLIGHT_PAD,
      width: head.right - head.left + 2 * HIGHLIGHT_PAD,
      y: y(layout, SNARE_LINE) + head.top - HIGHLIGHT_PAD,
      height: head.bottom - head.top + 2 * HIGHLIGHT_PAD,
    })
    const rest = REST_INK[4]
    expect(rects.get('b0/1@1')).toEqual({
      row: 0,
      x: HEAD_PX + Q + rest.left - HIGHLIGHT_PAD,
      width: rest.right - rest.left + 2 * HIGHLIGHT_PAD,
      y: y(layout, restLine(4)) + rest.top - HIGHLIGHT_PAD,
      height: rest.bottom - rest.top + 2 * HIGHLIGHT_PAD,
    })
    // a half note's box is its head's, however long it sounds
    expect(rects.get('b0/2@1')?.width).toBe(rects.get('b0/0@1')?.width)
    expect(rects.size).toBe(3)
  })

  it('a box is as wide as its glyph: a whole head is wider than a black one, a 32nd rest wider and taller than a quarter rest', () => {
    const score = piece([bar([N(1)]), bar([R(4), R(32), R(32), R(32), R(32), R(32), R(32), R(4), R(4), R(16)])])
    const layout = buildLayout(score, { barsPerRow: 2, auto: true })
    const rects = highlightRects(score, layout)
    const w = (key: string) => rects.get(key)?.width ?? 0
    const h = (key: string) => rects.get(key)?.height ?? 0
    expect(w('b0/0@1')).toBe(HEAD_INK[1].right - HEAD_INK[1].left + 2 * HIGHLIGHT_PAD)
    expect(w('b0/0@1')).toBeGreaterThan(HEAD_INK[4].right - HEAD_INK[4].left + 2 * HIGHLIGHT_PAD)
    expect(w('b1/1@1')).toBeGreaterThan(w('b1/0@1'))
    expect(h('b1/1@1')).toBeGreaterThan(h('b1/0@1'))
  })

  it("a whole rest's box hangs from the fourth line, the one its glyph hangs from", () => {
    const score = piece([bar([R(1)])])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    expect(highlightRects(score, layout).get('b0/0@1')?.y).toBe(y(layout, 3) + REST_INK[1].top - HIGHLIGHT_PAD)
  })

  it('a box reaches no further than its pad under a neighbour, even on the tightest grid: 32nds at natural size', () => {
    const score = piece([bar(Array.from({ length: 32 }, () => N(32)))])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const rects = highlightRects(score, layout)
    const head = HEAD_INK[32]
    for (let i = 1; i < 31; i++) {
      const r = rects.get(`b0/${i}@1`)
      const prev = layout.boxes.get(`b0/${i - 1}@1`)
      const next = layout.boxes.get(`b0/${i + 1}@1`)
      if (!r || !prev || !next) throw new Error('missing box')
      expect(prev.x + head.right - r.x).toBeLessThanOrEqual(HIGHLIGHT_PAD + 0.5)
      expect(r.x + r.width - (next.x + head.left)).toBeLessThanOrEqual(HIGHLIGHT_PAD + 0.5)
    }
  })

  it('every pass of a repeat has its rects, on its own drawn bar: one bar per row, the second pass on row 1', () => {
    const score = piece([bar(q4(), { repeat: { end: {} } }), bar(q4())])
    const layout = buildLayout(score, { barsPerRow: 1, auto: true })
    const rects = highlightRects(score, layout)
    expect(layout.playback.map((pb) => [pb.barIndex, pb.pass])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
    ])
    const first = rects.get('b0/0@1')
    if (!first) throw new Error('missing rect')
    // The same glyph, on the next row, behind the clef alone.
    expect(rects.get('b0/0@2')).toEqual({ ...first, row: 1, x: CLEF_PX + HEAD_INK[4].left - HIGHLIGHT_PAD })
    expect(rects.get('b1/3@1')?.row).toBe(2)
    expect(rects.size).toBe(12)
  })
})
