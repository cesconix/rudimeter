import { describe, expect, it } from 'bun:test'
import { frac } from '../score/fraction'
import type { Bar, Event, Item, NoteBase, Score } from '../score/types'
import {
  BAR_PAD,
  BARLINE_OVERHANG,
  barHeads,
  buildLayout,
  CLEF_PX,
  CURSOR_OVERHANG,
  DRAG_PX,
  FLAM_PX,
  HEAD_PX,
  INK_ABOVE,
  inkAbove,
  LABEL_ABOVE,
  LABEL_INK_ABOVE,
  LINE_PX,
  METER_PX,
  MIN_NOTEHEAD_PX,
  NOTEHEAD_PX,
  PX_PER_WHOLE,
  REPEAT_BAR_PX,
  REPEAT_PX,
  restLine,
  rowBand,
  SNARE_LINE,
  STAFF_BELOW,
  STAFF_H,
  STAFF_LINES,
  STICKING_AIR,
  STICKING_INK,
} from './layout'

const n = (base: NoteBase, dots?: 1 | 2): Event => (dots ? { duration: { base, dots } } : { duration: { base } })
const quarters = (): Item[] => [n(4), n(4), n(4), n(4)]
const bar = (items: Item[], extra: Partial<Bar> = {}): Bar => ({ ...extra, items })
const piece = (bars: Bar[]): Score => ({
  id: 'p',
  title: 'p',
  bars: bars.map((b, i) => (i === 0 && !b.meter ? { meter: [4, 4], ...b } : b)),
})
const W = PX_PER_WHOLE

describe('constants', () => {
  it('under the staff: the letters and STICKING_AIR times their air, whole px; the floor is under the natural notehead', () => {
    expect(STAFF_H).toBe((STAFF_LINES - 1) * LINE_PX)
    expect(STAFF_BELOW - STICKING_INK.bottom).toBeGreaterThanOrEqual(STICKING_AIR * STICKING_INK.top)
    expect(STAFF_BELOW - STICKING_INK.bottom).toBeLessThan(STICKING_AIR * STICKING_INK.top + 1)
    expect(Number.isInteger(STAFF_BELOW)).toBe(true)
    expect(MIN_NOTEHEAD_PX).toBeLessThan(NOTEHEAD_PX)
  })
  it('the snare sits in the third space, a rest on the middle line, a whole rest hanging from the fourth', () => {
    expect(SNARE_LINE).toBe(2.5)
    for (const base of [2, 4, 8, 16, 32] as const) expect(restLine(base)).toBe(2)
    expect(restLine(1)).toBe(3)
  })
  it("the cursor band reaches past the staff by as much above as below, and stops under the labels' baseline", () => {
    expect(CURSOR_OVERHANG).toBeGreaterThan(0)
    expect(CURSOR_OVERHANG).toBeLessThan(LABEL_ABOVE)
  })
})

describe('rows', () => {
  it('packs barsPerRow bars per row, numbers the rows and ends each where the next bar would start', () => {
    const layout = buildLayout(piece(Array.from({ length: 10 }, () => bar(quarters()))), { barsPerRow: 4, auto: true })
    expect(layout.rows.map((r) => r.bars.length)).toEqual([4, 4, 2])
    expect(layout.rows.map((r) => r.index)).toEqual([0, 1, 2])
    expect(layout.rowOfBar).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2])
    expect(layout.systemH).toBe(rowBand(piece([bar(quarters())])).systemH)
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
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 4 * W + 3 * BAR_PAD + BARLINE_OVERHANG)
    // The later rows reprint the clef only: their music starts sooner.
    expect(layout.rows[2].rowEndX).toBe(CLEF_PX + 2 * W + BAR_PAD)
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

  it('the first bar of every row shows the clef and keeps room for it alone; the meter only where it changes', () => {
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
    })
    expect(layout.rows[1].bars[0]).toMatchObject({
      barIndex: 2,
      x: CLEF_PX,
      head: CLEF_PX,
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
    expect(layout.rows[0].stretch).toBe(1)
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 2 * W + BAR_PAD + BARLINE_OVERHANG)
  })

  it('stretches the grid so the row reaches fillWidth; heads and pads keep their size', () => {
    const fillWidth = 1000
    const layout = buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth })
    // (1000 − 83 − 12 − 1) / 768: the music takes what the fixed parts leave.
    const s = (fillWidth - HEAD_PX - BAR_PAD - BARLINE_OVERHANG) / (2 * W)
    expect(layout.rows[0].stretch).toBeCloseTo(s, 10)
    expect(layout.rows[0].widthNatural).toBeCloseTo(fillWidth, 10)
    expect(layout.rows[0].bars[0]).toMatchObject({ x: HEAD_PX, width: W * s, head: HEAD_PX })
    expect(layout.rows[0].bars[1]).toMatchObject({ x: HEAD_PX + W * s + BAR_PAD, width: W * s, head: BAR_PAD })
    // The boxes are the stretched grid's slices: the second quarter of bar 2 starts a quarter (stretched) into it.
    expect(layout.boxes.get('b1/1')).toMatchObject({
      x: HEAD_PX + W * s + BAR_PAD + (W / 4) * s,
      width: (W / 4) * s,
      position: frac(5, 4),
    })
  })

  it('never shrinks: a fillWidth narrower than the natural row leaves the grid natural', () => {
    const layout = buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: 500 })
    expect(layout.rows[0].stretch).toBe(1)
    expect(layout.rows[0].widthNatural).toBe(HEAD_PX + 2 * W + BAR_PAD + BARLINE_OVERHANG)
  })

  it('every full row reaches fillWidth on its own stretch, whatever its heads take', () => {
    // Row 0 draws the signature (HEAD_PX), row 1 the clef alone (CLEF_PX): less head, more stretch.
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
      fillWidth: 1000,
    })
    expect(layout.rows.map((r) => r.widthNatural)).toEqual([expect.closeTo(1000, 10), expect.closeTo(1000, 10)])
    expect(layout.rows[0].stretch).toBeCloseTo((1000 - HEAD_PX - BAR_PAD - BARLINE_OVERHANG) / (2 * W), 10)
    expect(layout.rows[1].stretch).toBeCloseTo((1000 - CLEF_PX - BAR_PAD - BARLINE_OVERHANG) / (2 * W), 10)
    // Inside a row every box is on that row's grid.
    expect(layout.boxes.get('b3/1')?.width).toBeCloseTo((W / 4) * layout.rows[1].stretch, 10)
  })

  it('a row with fewer bars than the full ones is not spread across the width: it takes the tightest full stretch', () => {
    const layout = buildLayout(
      piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]),
      { barsPerRow: 2, auto: true, fillWidth: 1000 },
    )
    const tightest = Math.min(layout.rows[0].stretch, layout.rows[1].stretch)
    expect(tightest).toBe(layout.rows[0].stretch)
    expect(layout.rows[2].stretch).toBe(tightest)
    expect(layout.rows[2].widthNatural).toBeCloseTo(CLEF_PX + W * tightest + BARLINE_OVERHANG, 10)
    expect(layout.rows[2].widthNatural).toBeLessThan(1000)
  })

  it('mixed meters: every full row reaches fillWidth, the one with a meter gutter included', () => {
    const layout = buildLayout(
      piece([
        bar(quarters()),
        bar([n(4), n(4), n(4)], { meter: [3, 4] }),
        bar(quarters(), { meter: [4, 4] }),
        bar(quarters()),
      ]),
      { barsPerRow: 2, auto: true, fillWidth: 1200 },
    )
    for (const row of layout.rows) expect(row.widthNatural).toBeCloseTo(1200, 10)
  })

  it('a non-finite fillWidth is no fillWidth', () => {
    expect(buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: Number.NaN }).rows[0].stretch).toBe(1)
    const infinite = buildLayout(two(), { barsPerRow: 2, auto: true, fillWidth: Number.POSITIVE_INFINITY })
    expect(infinite.rows[0].stretch).toBe(1)
  })
})

describe('boxes', () => {
  it("are the event's slice of the grid: dotted values take their dotted width", () => {
    const layout = buildLayout(piece([bar([n(4, 1), n(8), n(4), n(4)])]), { barsPerRow: 4, auto: true })
    const box = (k: string) => layout.boxes.get(k)
    expect(box('b0/0')).toEqual({
      id: { bar: 0, item: 0 },
      row: 0,
      x: HEAD_PX,
      width: (3 * W) / 8,
      position: frac(0),
      length: frac(3, 8),
      rest: false,
    })
    expect(box('b0/1')).toMatchObject({ x: HEAD_PX + (3 * W) / 8, width: W / 8, position: frac(3, 8) })
    expect(box('b0/2')).toMatchObject({ x: HEAD_PX + W / 2, width: W / 4, position: frac(1, 2) })
    expect(box('b0/3')).toMatchObject({ x: HEAD_PX + (3 * W) / 4, width: W / 4, position: frac(3, 4) })
    expect(layout.boxes.size).toBe(4)
  })

  it('a rest has a box and is a rest', () => {
    const layout = buildLayout(piece([bar([n(4), { duration: { base: 4 }, rest: true }, n(2)])]), {
      barsPerRow: 4,
      auto: true,
    })
    expect(layout.boxes.get('b0/1')).toMatchObject({ x: HEAD_PX + W / 4, width: W / 4, rest: true })
    expect(layout.boxes.get('b0/2')).toMatchObject({ x: HEAD_PX + W / 2, width: W / 2, rest: false })
    expect(layout.boxes.size).toBe(3)
  })

  it('a tuplet scales its items and keys them with their sub index', () => {
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] }
    const layout = buildLayout(piece([bar([triplet, n(4), n(4), n(4)])]), { barsPerRow: 4, auto: true })
    expect(layout.boxes.get('b0/0.0')).toMatchObject({
      id: { bar: 0, item: 0, sub: 0 },
      x: HEAD_PX,
      width: W / 12,
      length: frac(1, 12),
    })
    expect(layout.boxes.get('b0/0.1')).toMatchObject({ x: HEAD_PX + W / 12, position: frac(1, 12) })
    expect(layout.boxes.get('b0/0.2')).toMatchObject({ x: HEAD_PX + W / 6, position: frac(1, 6) })
    expect(layout.boxes.get('b0/1')).toMatchObject({ x: HEAD_PX + W / 4, position: frac(1, 4) })
  })

  it('across rows a box carries its row, its x inside the row and its written position in the piece', () => {
    const layout = buildLayout(piece([bar(quarters()), bar(quarters()), bar(quarters()), bar(quarters())]), {
      barsPerRow: 2,
      auto: true,
    })
    expect(layout.boxes.get('b1/0')).toMatchObject({ row: 0, x: HEAD_PX + W + BAR_PAD, position: frac(1) })
    expect(layout.boxes.get('b2/0')).toMatchObject({ row: 1, x: CLEF_PX, position: frac(2) })
    expect(layout.boxes.get('b3/3')).toMatchObject({
      row: 1,
      x: CLEF_PX + W + BAR_PAD + (3 * W) / 4,
      position: frac(15, 4),
    })
  })
})

describe('heads', () => {
  const flam = (base: NoteBase = 4): Event => ({ duration: { base }, grace: { kind: 'flam' } })
  const drag = (base: NoteBase = 4): Event => ({ duration: { base }, grace: { kind: 'drag' } })

  it('a bar keeps room for what it prints and nothing else: clef or signature, begin repeat, grace notes on its first note', () => {
    const heads = barHeads(
      piece([
        bar(quarters()),
        bar(quarters(), { repeat: { start: true, end: {} } }),
        bar([flam(), n(4), n(4), n(4)]),
        bar([drag(), n(4), n(4), n(4)], { repeat: { start: true, end: {} } }),
        bar([drag(), n(4), n(4)], { meter: [3, 4], repeat: { start: true, end: {} } }),
      ]),
    )
    expect(heads).toEqual([
      { first: HEAD_PX, after: METER_PX, signature: true },
      { first: CLEF_PX + REPEAT_PX, after: BAR_PAD + REPEAT_BAR_PX, signature: false },
      { first: CLEF_PX + FLAM_PX, after: BAR_PAD + FLAM_PX, signature: false },
      { first: CLEF_PX + REPEAT_PX + DRAG_PX, after: BAR_PAD + REPEAT_BAR_PX + DRAG_PX, signature: false },
      { first: HEAD_PX + REPEAT_PX + DRAG_PX, after: METER_PX + REPEAT_PX + DRAG_PX, signature: true },
    ])
  })

  it('only the first note counts: a grace later in the bar, or a first event that is a rest, keeps the plain head', () => {
    const rest: Event = { duration: { base: 4 }, rest: true }
    const triplet: Item = { tuplet: { actual: 3, normal: 2 }, items: [flam(8), n(8), n(8)] }
    const heads = barHeads(
      piece([
        bar(quarters()),
        bar([n(4), flam(), n(4), n(4)]),
        bar([rest, flam(), n(4), n(4)]),
        bar([triplet, n(4), n(4), n(4)]),
      ]),
    )
    expect(heads.map((h) => h.after)).toEqual([METER_PX, BAR_PAD, BAR_PAD, BAR_PAD + FLAM_PX])
  })

  it('the layout puts each bar behind its head: a flam on a downbeat mid-row sits after the barline, its note FLAM_PX later', () => {
    const layout = buildLayout(piece([bar(quarters()), bar([flam(), n(4), n(4), n(4)])]), { barsPerRow: 2, auto: true })
    expect(layout.rows[0].bars[1]).toMatchObject({ head: BAR_PAD + FLAM_PX, x: HEAD_PX + W + BAR_PAD + FLAM_PX })
    expect(layout.boxes.get('b1/0')?.x).toBe(HEAD_PX + W + BAR_PAD + FLAM_PX)
  })
})

describe('band', () => {
  const one = (items: Item[]) => piece([bar(items)])
  const s = (extra: Partial<Event> = {}): Event => ({ duration: { base: 16 }, ...extra })
  const sixteenths = (extra: Partial<Event> = {}): Item[] => Array.from({ length: 16 }, () => s(extra))

  it("a plain piece: the labels' height, up to a whole px, and the letters' room under the staff", () => {
    const band = rowBand(one(quarters()))
    expect(band.staffTop).toBe(Math.ceil(LABEL_INK_ABOVE))
    expect(band.systemH).toBe(band.staffTop + STAFF_H + STAFF_BELOW)
    // A piece with no sticking keeps the letters' room: rows breathe alike from one piece to the next.
    expect(rowBand(one(sixteenths({ sticking: 'R' }))).systemH).toBe(band.systemH)
  })

  it('each mark by the table: an accent, a text, both; a text over a rest counts as both', () => {
    const { plain } = INK_ABOVE.free
    expect(inkAbove(one(sixteenths({ accent: true })))).toBe(plain.accent)
    expect(inkAbove(one(sixteenths({ text: 'Rip' })))).toBe(plain.text)
    expect(inkAbove(one(sixteenths({ accent: true, text: 'Rip' })))).toBe(plain.accentText)
    expect(inkAbove(one([{ duration: { base: 4 }, rest: true, text: 'Fill' }, n(4), n(4), n(4)]))).toBe(
      plain.accentText,
    )
  })

  it('grace notes and rolls stay under the stem: the labels decide', () => {
    const extra: Partial<Event> = { grace: { kind: 'drag' }, roll: { kind: 'tremolo', slashes: 3 } }
    expect(inkAbove(one(sixteenths(extra)))).toBe(LABEL_INK_ABOVE)
  })

  it("a 32nd's stems, flagged or beamed; a longer stroke on a 32nd's beam hangs from it and takes its class", () => {
    const { thirtySecond } = INK_ABOVE.free
    expect(inkAbove(one(Array.from({ length: 32 }, () => ({ duration: { base: 32 } }) as Event)))).toBe(
      thirtySecond.none,
    )
    // The accent is on the sixteenth; the beam it hangs from is the 32nd's.
    const beat: Item[] = [s({ accent: true }), { duration: { base: 32 } }, { duration: { base: 32 } }, n(8)]
    expect(inkAbove(one([...beat, ...beat, ...beat, ...beat]))).toBe(thirtySecond.accent)
  })

  it('a tuplet is one stack: its bracket rides over the tallest of the group, with every mark any of its events carries', () => {
    const t: Item = {
      tuplet: { actual: 3, normal: 2 },
      items: [{ duration: { base: 8 }, accent: true }, { duration: { base: 8 }, text: 'Three' }, n(8)],
    }
    expect(inkAbove(one([t, n(4), n(2)]))).toBe(INK_ABOVE.tuplet.plain.accentText)
    // The strokes outside the group keep their own height: a plain quarter is under the bracket's.
    expect(inkAbove(one([{ tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] }, n(4), n(2)]))).toBe(
      INK_ABOVE.tuplet.plain.none,
    )
  })

  it('the tallest event decides the band of every row, whatever the width and the bars per row', () => {
    const score = piece([
      bar(quarters()),
      bar(quarters()),
      bar([n(4), n(4), n(4), { duration: { base: 4 }, text: 'Fine' }]),
    ])
    const band = rowBand(score)
    expect(band.staffTop).toBe(Math.ceil(INK_ABOVE.free.plain.text))
    for (const barsPerRow of [1, 2, 3])
      for (const fillWidth of [undefined, 900, 2000])
        expect(buildLayout(score, { barsPerRow, auto: true, fillWidth })).toMatchObject(band)
  })
})
