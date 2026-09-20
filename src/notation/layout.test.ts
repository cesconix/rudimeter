import { describe, expect, it } from 'bun:test'
import { frac } from '../score/fraction'
import type { Bar, Event, Item, NoteBase, Score } from '../score/types'
import {
  BAR_PAD,
  buildLayout,
  GRACE_GUTTER,
  HEAD_PX,
  hasGrace,
  LINE_PX,
  METER_PX,
  MIN_NOTEHEAD_PX,
  NOTEHEAD_PX,
  PX_PER_WHOLE,
  RIGHT_PAD,
  STAFF_BELOW,
  STAFF_H,
  STAFF_LINES,
  STAFF_TOP,
  SYSTEM_H,
} from './layout'

const n = (base: NoteBase, dots?: 1 | 2): Event =>
  dots
    ? { duration: { base, dots }, notes: [{ instrument: 'snare' }] }
    : { duration: { base }, notes: [{ instrument: 'snare' }] }
const quarters = (): Item[] => [n(4), n(4), n(4), n(4)]
/** A `pad` bar: hands up, and feet down when given. */
const bar = (up: Item[], extra: Partial<Bar> = {}, down?: Item[]): Bar => ({
  ...extra,
  parts: {
    pad: {
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
  parts: [{ id: 'pad', kind: 'drumset' }],
  bars: bars.map((b, i) => (i === 0 && !b.meter ? { meter: [4, 4], ...b } : b)),
})
const W = PX_PER_WHOLE

describe('constants', () => {
  it('the band is the sum of its parts, and the floor is under the natural notehead', () => {
    expect(STAFF_H).toBe((STAFF_LINES - 1) * LINE_PX)
    expect(SYSTEM_H).toBe(STAFF_TOP + STAFF_H + STAFF_BELOW)
    expect(MIN_NOTEHEAD_PX).toBeLessThan(NOTEHEAD_PX)
    // VexFlow reads the space above and below the staff in line spaces (`spaceAboveStaffLn`).
    expect(STAFF_TOP % LINE_PX).toBe(0)
    expect(STAFF_BELOW % LINE_PX).toBe(0)
  })
})

describe('rows', () => {
  it('packs barsPerRow bars per row, numbers the rows and ends each where the next bar would start', () => {
    const layout = buildLayout(piece(Array.from({ length: 10 }, () => bar(quarters()))), { barsPerRow: 4, auto: true })
    expect(layout.rows.map((r) => r.bars.length)).toEqual([4, 4, 2])
    expect(layout.rows.map((r) => r.index)).toEqual([0, 1, 2])
    expect(layout.rowOfBar).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2])
    expect(layout.gridX0).toBe(HEAD_PX)
    expect(layout.systemH).toBe(SYSTEM_H)
    expect(layout.rows[0].bars[0]).toEqual({
      barIndex: 0,
      x: HEAD_PX,
      width: W,
      head: HEAD_PX,
      showClef: true,
      showMeter: true,
    })
    // A bar with neither clef nor meter still starts `BAR_PAD` after its barline: the air the row head and the meter gutter already carry.
    expect(layout.rows[0].bars[1]).toEqual({
      barIndex: 1,
      x: HEAD_PX + W + BAR_PAD,
      width: W,
      head: BAR_PAD,
      showClef: false,
      showMeter: false,
    })
    expect(layout.rows[0].rowEndX).toBe(HEAD_PX + 4 * W + 3 * BAR_PAD)
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 4 * W + 3 * BAR_PAD + RIGHT_PAD)
    expect(layout.rows[2].rowEndX).toBe(HEAD_PX + 2 * W + BAR_PAD)
  })

  it('newRow starts a row in automatic mode and is ignored when the user fixed the row', () => {
    const bars = [
      bar(quarters()),
      bar(quarters()),
      bar(quarters(), { newRow: true }),
      bar(quarters()),
      bar(quarters(), { newRow: true }),
      bar(quarters()),
    ]
    expect(
      buildLayout(piece(bars), { barsPerRow: 4, auto: true }).rows.map((r) => r.bars.map((b) => b.barIndex)),
    ).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
    expect(
      buildLayout(piece(bars), { barsPerRow: 4, auto: false }).rows.map((r) => r.bars.map((b) => b.barIndex)),
    ).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ])
  })

  it('a newRow on a bar that already starts a row does not open an empty one', () => {
    const bars = [
      bar(quarters(), { newRow: true }),
      bar(quarters()),
      bar(quarters()),
      bar(quarters()),
      bar(quarters(), { newRow: true }),
      bar(quarters()),
    ]
    expect(buildLayout(piece(bars), { barsPerRow: 4, auto: true }).rows.map((r) => r.bars.length)).toEqual([4, 2])
  })

  it('the first bar of every row shows the clef; the meter only where it changes', () => {
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
    })
    expect(layout.rows[1].bars[0]).toMatchObject({
      barIndex: 2,
      x: HEAD_PX,
      head: HEAD_PX,
      showClef: true,
      showMeter: false,
    })
  })

  it('mixed meters: each bar is as wide as it lasts; a change mid-row pays the meter gutter, a restated meter draws nothing', () => {
    const bars = [
      bar(quarters()),
      bar([n(4), n(4), n(4)], { meter: [3, 4] }),
      bar([n(4), n(4), n(4)]),
      bar([n(4), n(4), n(4)], { meter: [3, 4] }),
      bar([n(8), n(8), n(8), n(8), n(8), n(8)], { meter: [6, 8] }),
    ]
    const layout = buildLayout(piece(bars), { barsPerRow: 8, auto: true })
    const row = layout.rows[0].bars
    expect(row.map((b) => b.width)).toEqual([W, (3 * W) / 4, (3 * W) / 4, (3 * W) / 4, (3 * W) / 4])
    expect(row.map((b) => b.showMeter)).toEqual([true, true, false, false, true])
    expect(row.map((b) => b.head)).toEqual([HEAD_PX, METER_PX, BAR_PAD, BAR_PAD, METER_PX])
    expect(row.map((b) => b.x)).toEqual([
      HEAD_PX,
      HEAD_PX + W + METER_PX,
      HEAD_PX + W + METER_PX + (3 * W) / 4 + BAR_PAD,
      HEAD_PX + W + METER_PX + (6 * W) / 4 + 2 * BAR_PAD,
      HEAD_PX + W + METER_PX + (9 * W) / 4 + 2 * BAR_PAD + METER_PX,
    ])
    expect(layout.rows[0].rowEndX).toBe(row[4].x + row[4].width)
  })

  it('a meter change on the first bar of a row pays the row head, not the mid-row meter gutter', () => {
    const bars = [bar(quarters()), bar(quarters()), bar([n(4), n(4), n(4)], { meter: [3, 4], newRow: true })]
    const layout = buildLayout(piece(bars), { barsPerRow: 4, auto: true })
    expect(layout.rows[1].bars[0]).toEqual({
      barIndex: 2,
      x: HEAD_PX,
      width: (3 * W) / 4,
      head: HEAD_PX,
      showClef: true,
      showMeter: true,
    })
  })

  it('a barsPerRow below one, or not a number, packs one bar per row', () => {
    const three = piece([bar(quarters()), bar(quarters()), bar(quarters())])
    expect(buildLayout(three, { barsPerRow: 0, auto: true }).rows.length).toBe(3)
    expect(buildLayout(three, { barsPerRow: Number.NaN, auto: true }).rows.length).toBe(3)
  })
})

describe('justification', () => {
  const two = () => piece([bar(quarters()), bar(quarters())])

  it('without fillWidth the grid is natural: stretch 1', () => {
    const layout = buildLayout(two(), { barsPerRow: 2, auto: true })
    expect(layout.stretch).toBe(1)
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 2 * W + BAR_PAD + RIGHT_PAD)
  })

  it('stretches the grid so the row reaches fillWidth; heads and pads keep their size', () => {
    const fillWidth = 1000
    const layout = buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth })
    // (1000 − 83 − 12 − 8) / 768: the music takes what the fixed parts leave.
    const s = (fillWidth - HEAD_PX - BAR_PAD - RIGHT_PAD) / (2 * W)
    expect(layout.stretch).toBeCloseTo(s, 10)
    expect(layout.rows[0].widthNatural).toBeCloseTo(fillWidth, 10)
    expect(layout.rows[0].bars[0]).toMatchObject({ x: HEAD_PX, width: W * s, head: HEAD_PX })
    expect(layout.rows[0].bars[1]).toMatchObject({ x: HEAD_PX + W * s + BAR_PAD, width: W * s, head: BAR_PAD })
    // The boxes are the stretched grid's slices: the second quarter of bar 2 starts a quarter (stretched) into it.
    expect(layout.boxes.get('b1/pad/0/1')).toMatchObject({
      x: HEAD_PX + W * s + BAR_PAD + (W / 4) * s,
      width: (W / 4) * s,
      position: frac(5, 4),
    })
  })

  it('never shrinks: a fillWidth narrower than the natural row leaves the grid natural', () => {
    const layout = buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: 500 })
    expect(layout.stretch).toBe(1)
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 2 * W + BAR_PAD + RIGHT_PAD)
  })

  it('one stretch for the piece, set by the row that fills first; the other rows stay shorter', () => {
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
      fillWidth: 1000,
    })
    expect(layout.rows[0].widthNatural).toBeCloseTo(1000, 10)
    expect(layout.rows[1].widthNatural).toBeCloseTo(HEAD_PX + W * layout.stretch + RIGHT_PAD, 10)
    expect(layout.rows[1].widthNatural).toBeLessThan(1000)
  })

  it('a row of shorter bars binds the stretch when its fixed parts are the widest: mixed meters', () => {
    // Row 0: 4/4 + 3/4 with a meter gutter; row 1: 4/4 + 4/4 with a pad. Row 1 has more music and
    // less fixed width, so it is the one that reaches fillWidth.
    const layout = buildLayout(
      piece([
        bar(quarters()),
        bar([n(4), n(4), n(4)], { meter: [3, 4] }),
        bar(quarters(), { meter: [4, 4] }),
        bar(quarters()),
      ]),
      { barsPerRow: 2, auto: true, fillWidth: 1200 },
    )
    const widths = layout.rows.map((r) => r.widthNatural)
    expect(Math.max(...widths)).toBeCloseTo(1200, 10)
    expect(widths[1]).toBeCloseTo(1200, 10)
    expect(widths[0]).toBeLessThan(1200)
  })

  it('a non-finite fillWidth is no fillWidth', () => {
    expect(buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: Number.NaN }).stretch).toBe(1)
    expect(buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: Number.POSITIVE_INFINITY }).stretch).toBe(1)
  })
})

describe('boxes', () => {
  it("are the event's slice of the grid: dotted values take their dotted width", () => {
    const layout = buildLayout(piece([bar([n(4, 1), n(8), n(4), n(4)])]), { barsPerRow: 4, auto: true })
    const box = (k: string) => layout.boxes.get(k)
    expect(box('b0/pad/0/0')).toEqual({
      id: { bar: 0, part: 'pad', voice: 0, item: 0 },
      row: 0,
      x: HEAD_PX,
      width: (3 * W) / 8,
      position: frac(0),
      length: frac(3, 8),
      rest: false,
    })
    expect(box('b0/pad/0/1')).toMatchObject({ x: HEAD_PX + (3 * W) / 8, width: W / 8, position: frac(3, 8) })
    expect(box('b0/pad/0/2')).toMatchObject({ x: HEAD_PX + W / 2, width: W / 4, position: frac(1, 2) })
    expect(box('b0/pad/0/3')).toMatchObject({ x: HEAD_PX + (3 * W) / 4, width: W / 4, position: frac(3, 4) })
    expect(layout.boxes.size).toBe(4)
  })

  it('a tuplet scales its items and keys them with their sub index', () => {
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] }
    const layout = buildLayout(piece([bar([triplet, n(4), n(4), n(4)])]), { barsPerRow: 4, auto: true })
    expect(layout.boxes.get('b0/pad/0/0.0')).toMatchObject({
      id: { bar: 0, part: 'pad', voice: 0, item: 0, sub: 0 },
      x: HEAD_PX,
      width: W / 12,
      length: frac(1, 12),
    })
    expect(layout.boxes.get('b0/pad/0/0.1')).toMatchObject({ x: HEAD_PX + W / 12, position: frac(1, 12) })
    expect(layout.boxes.get('b0/pad/0/0.2')).toMatchObject({ x: HEAD_PX + W / 6, position: frac(1, 6) })
    expect(layout.boxes.get('b0/pad/0/1')).toMatchObject({ x: HEAD_PX + W / 4, position: frac(1, 4) })
  })

  it('two voices at the same instant share x; a hidden rest has a box and is a rest', () => {
    const down: Item[] = [
      { duration: { base: 4 }, notes: [{ instrument: 'kick' }] },
      { duration: { base: 4 }, rest: true, hidden: true },
      { duration: { base: 4 }, notes: [{ instrument: 'kick' }] },
      { duration: { base: 4 }, rest: true, hidden: true },
    ]
    const layout = buildLayout(piece([bar(quarters(), {}, down)]), { barsPerRow: 4, auto: true })
    expect(layout.boxes.get('b0/pad/1/0')?.x).toBe(layout.boxes.get('b0/pad/0/0')?.x)
    expect(layout.boxes.get('b0/pad/1/1')).toMatchObject({ x: HEAD_PX + W / 4, width: W / 4, rest: true })
    expect(layout.boxes.get('b0/pad/0/1')).toMatchObject({ rest: false })
    expect(layout.boxes.size).toBe(8)
  })

  it('across rows a box carries its row, its x inside the row and its written position in the piece', () => {
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
    })
    expect(layout.boxes.get('b1/pad/0/0')).toMatchObject({ row: 0, x: HEAD_PX + W + BAR_PAD, position: frac(1) })
    expect(layout.boxes.get('b2/pad/0/0')).toMatchObject({ row: 1, x: HEAD_PX, position: frac(2) })
    expect(layout.boxes.get('b3/pad/0/3')).toMatchObject({
      row: 1,
      x: HEAD_PX + W + BAR_PAD + (3 * W) / 4,
      position: frac(15, 4),
    })
  })

  it('a simile bar gets the boxes of the bar it repeats, under its own bar index', () => {
    const layout = buildLayout(piece([bar([n(4, 1), n(8), n(2)]), { simile: true }, { simile: true }]), {
      barsPerRow: 4,
      auto: true,
    })
    expect(layout.boxes.get('b1/pad/0/0')).toMatchObject({
      id: { bar: 1, part: 'pad', voice: 0, item: 0 },
      x: HEAD_PX + W + BAR_PAD,
      width: (3 * W) / 8,
      position: frac(1),
    })
    expect(layout.boxes.get('b2/pad/0/2')).toMatchObject({
      id: { bar: 2, part: 'pad', voice: 0, item: 2 },
      x: HEAD_PX + 2 * W + 2 * BAR_PAD + W / 2,
      position: frac(5, 2),
    })
    expect(layout.boxes.size).toBe(9)
  })

  it('the grace gutter moves the origin of every row only when the piece has a grace note', () => {
    const flam: Item = { duration: { base: 4 }, notes: [{ instrument: 'snare' }], grace: { kind: 'flam' } }
    const plainPiece = piece([bar(quarters()), bar(quarters())])
    const gracedPiece = piece([bar(quarters()), bar([flam, n(4), n(4), n(4)])])
    expect(hasGrace(plainPiece)).toBe(false)
    expect(hasGrace(gracedPiece)).toBe(true)
    const plain = buildLayout(plainPiece, { barsPerRow: 1, auto: true })
    const graced = buildLayout(gracedPiece, { barsPerRow: 1, auto: true })
    expect(plain.gridX0).toBe(HEAD_PX)
    expect(graced.gridX0).toBe(HEAD_PX + GRACE_GUTTER)
    expect(graced.rows.map((r) => r.bars[0].x)).toEqual([HEAD_PX + GRACE_GUTTER, HEAD_PX + GRACE_GUTTER])
    expect(graced.boxes.get('b1/pad/0/0')?.x).toBe(HEAD_PX + GRACE_GUTTER)
  })
})

describe('brackets', () => {
  it('consecutive bars under the same ending numbers form one bracket; different numbers, another', () => {
    const bars = [
      bar(quarters(), { repeat: { start: true } }),
      bar(quarters(), { ending: [1] }),
      bar(quarters(), { ending: [1], repeat: { end: {} } }),
      bar(quarters(), { ending: [2] }),
      bar(quarters(), { ending: [1, 2] }),
      bar(quarters()),
    ]
    const brackets = buildLayout(piece(bars), { barsPerRow: 8, auto: true }).rows[0].bars.map((b) => b.bracket)
    expect(brackets).toEqual([
      undefined,
      { numbers: [1], first: true, last: false },
      { numbers: [1], first: false, last: true },
      { numbers: [2], first: true, last: true },
      { numbers: [1, 2], first: true, last: true },
      undefined,
    ])
  })
})
