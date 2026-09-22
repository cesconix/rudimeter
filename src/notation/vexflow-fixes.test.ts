import { describe, expect, it } from 'bun:test'
import {
  BarlineType,
  Beam,
  Element,
  Formatter,
  GraceNote,
  GraceNoteGroup,
  type RenderContext,
  Stave,
  StaveNote,
  Stem,
  Tuplet,
  Voice,
} from 'vexflow/bravura'
import { AlignedBeam, AlignedGraceNoteGroup, AlignedStave, anchorStems, keepRestsOnTheirLines } from './vexflow-fixes'

// VexFlow measures text on a canvas and Bun has none: without one it warns once per glyph. Zero
// widths are enough here: these tests read y coordinates, and x only against each other (a beam's
// end against its stem's), never a glyph's width.
Element.setTextMeasurementCanvas({
  getContext: () => ({
    font: '',
    measureText: () => ({
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0,
    }),
  }),
} as unknown as HTMLCanvasElement)

interface Call {
  group: string
  op: string
  args: number[]
}

/** A context that draws nothing and records every call with the group it was made in: VexFlow's geometry with no DOM. */
function recorder(): { ctx: RenderContext; calls: Call[] } {
  const calls: Call[] = []
  const groups: string[] = []
  const ctx: RenderContext = new Proxy({} as RenderContext, {
    get:
      (_, op) =>
      (...args: number[]) => {
        if (op === 'openGroup') groups.push(String(args[0]))
        else if (op === 'closeGroup') groups.pop()
        else calls.push({ group: groups.at(-1) ?? '', op: String(op), args })
        return ctx
      },
  })
  return { ctx, calls }
}

/** The y of every `moveTo` made inside `group`, in drawing order. */
const movesIn = (calls: Call[], group: string) =>
  calls.filter((c) => c.group === group && c.op === 'moveTo').map((c) => c.args[1])
const linesIn = (calls: Call[], group: string) =>
  calls.filter((c) => c.group === group && c.op === 'lineTo').map((c) => c.args[1])

/** A quarter on c/5 (the snare's space) drawn on `stave`, with the grace notes given, stems up as the app draws them. */
function drawNote(stave: Stave, ctx: RenderContext, fix: boolean, graces = 0): { note: StaveNote; grace?: GraceNote } {
  const note = new StaveNote({ keys: ['c/5'], duration: 'q', stemDirection: Stem.UP })
  const grace = graces
    ? new GraceNote({ keys: ['c/5'], duration: '8', slash: true, stemDirection: Stem.UP })
    : undefined
  if (grace) note.addModifier(new GraceNoteGroup([grace], true).beamNotes(), 0)
  const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables([note])
  new Formatter().joinVoices([voice]).formatToStave([voice], stave)
  if (fix) anchorStems(note)
  voice.draw(ctx, stave)
  return { note, grace }
}

/** The y of every dot a repeat barline draws. */
const repeatDots = (calls: Call[]) =>
  calls.filter((c) => c.group === 'stavebarline' && c.op === 'arc').map((c) => c.args[1])

/** A stave with a repeat opening it and one closing it, drawn. */
function drawRepeats(stave: Stave): Call[] {
  const { ctx, calls } = recorder()
  stave.setBegBarType(BarlineType.REPEAT_BEGIN).setEndBarType(BarlineType.REPEAT_END)
  stave.setContext(ctx).draw()
  return calls
}

const snare = (duration: string) => new StaveNote({ keys: ['c/5'], duration, stemDirection: Stem.UP })
/** A rest on the middle line, as the app writes it: b/4, VexFlow's line 3. */
const rest = (duration: string) => new StaveNote({ keys: ['b/4'], duration, type: 'r', stemDirection: Stem.UP })

/** A beat of sixteenths, snare – rest – snare – snare, beamed and formatted on `stave`. */
function beamedBeat(stave: Stave): StaveNote[] {
  const notes = [snare('16'), rest('16'), snare('16'), snare('16')]
  new Beam(notes, false)
  const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables(notes)
  for (const n of notes) n.setStave(stave)
  new Formatter().joinVoices([voice]).formatToStave([voice], stave)
  return notes
}

/** An eighth triplet, snare – rest – snare, under its bracket. */
function triplet(stave: Stave): StaveNote[] {
  const notes = [snare('8'), rest('8'), snare('8')]
  for (const n of notes) n.setStave(stave)
  new Tuplet(notes, { numNotes: 3, notesOccupied: 2 })
  return notes
}

/** The x where each beam line drawn inside `group` ends: the third corner of each four-corner polygon. */
const beamEnds = (calls: Call[], group = 'beam') =>
  calls.filter((c) => c.group === group && c.op === 'lineTo').flatMap((c, i) => (i % 3 === 1 ? [c.args[0]] : []))
/** The x where each beam line drawn inside `group` starts. */
const beamStarts = (calls: Call[], group = 'beam') =>
  calls.filter((c) => c.group === group && c.op === 'moveTo').map((c) => c.args[0])

/** A beat of sixteenths on the snare under one beam — two lines, both running to the last stem — drawn. */
function drawBeamedBeat(fix: boolean): { notes: StaveNote[]; calls: Call[] } {
  const { ctx, calls } = recorder()
  const stave = new Stave(0, 0, 300)
  const notes = [snare('16'), snare('16'), snare('16'), snare('16')]
  const beam = fix ? new AlignedBeam(notes, false) : new Beam(notes, false)
  const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables(notes)
  new Formatter().joinVoices([voice]).formatToStave([voice], stave)
  voice.draw(ctx, stave)
  beam.setContext(ctx).draw()
  return { notes, calls }
}

/** A stem's outer edges: its centre ± half of VexFlow's stem width. */
const stemLeft = (n: StaveNote) => n.getStemX() - Stem.WIDTH / 2
const stemRight = (n: StaveNote) => n.getStemX() + Stem.WIDTH / 2

// These fail when a VexFlow upgrade no longer has the defect a fix stands for: that is the signal
// to delete the fix in `vexflow-fixes.ts`, not to change the test.
describe('VexFlow 5.0.0 defects the fixes stand for', () => {
  it("a stave strokes its lines half a pixel below getYForLine, and its barlines span that ink — AlignedStave's reason", () => {
    const { ctx, calls } = recorder()
    const stave = new Stave(0, 0, 200)
    stave.setContext(ctx).draw()
    expect(movesIn(calls, 'stave')).toEqual([0, 1, 2, 3, 4].map((i) => stave.getYForLine(i) + 0.5))
    const bar = calls.find((c) => c.op === 'fillRect')?.args ?? []
    expect([bar[1], bar[1] + bar[3]]).toEqual([stave.getYForLine(0), stave.getYForLine(4) + 1])
  })

  it("an up stem starts at its notehead's centre, not at the font's stem anchor — anchorStems' reason", () => {
    const { ctx, calls } = recorder()
    const { note } = drawNote(new Stave(0, 0, 200), ctx, false)
    expect(movesIn(calls, 'stem')).toEqual([note.getYs()[0]])
  })

  it("a repeat's dots sit 1 px below the centres of the spaces around the middle line — AlignedStave's barlines' reason", () => {
    const stave = new Stave(0, 0, 200)
    const want = [1.5, 2.5, 1.5, 2.5].map((line) => stave.getYForLine(line) + 1)
    expect(repeatDots(drawRepeats(stave))).toEqual(want)
  })

  it("a beam's lines end 0.5 px short of the last stem's outer edge, the right edge of a 1 px stem — AlignedBeam's reason", () => {
    const { notes, calls } = drawBeamedBeat(false)
    const last = notes[notes.length - 1]
    expect(Stem.WIDTH).toBe(1.5)
    expect(beamEnds(calls)).toEqual([stemLeft(last) + 1, stemLeft(last) + 1])
  })

  it("formatting moves a beamed rest to its neighbours' line, and a tuplet one inside it — keepRestsOnTheirLines' reason", () => {
    // c/5's space is VexFlow's line 3.5, the middle line 3.
    expect(beamedBeat(new Stave(0, 0, 200))[1].getKeyLine(0)).toBe(3.5)
    expect(triplet(new Stave(0, 0, 200))[1].getKeyLine(0)).toBe(3.5)
  })
})

describe('the fixes', () => {
  it("AlignedStave: every line centred on getYForLine, so a notehead in a space sits midway between its two lines' ink", () => {
    const { ctx, calls } = recorder()
    const stave = new AlignedStave(0, 0, 200)
    stave.setContext(ctx).draw()
    const lines = movesIn(calls, 'stave-lines')
    expect(lines).toEqual([0, 1, 2, 3, 4].map((i) => stave.getYForLine(i)))
    // VexFlow's own lines are hidden, not drawn twice.
    expect(movesIn(calls, 'stave')).toEqual([])
    // c/5 is the space between the second and the third line from the top.
    const { note } = drawNote(stave, recorder().ctx, true)
    expect(note.getYs()[0]).toBe((lines[1] + lines[2]) / 2)
  })

  it("AlignedStave: a barline spans the lines' ink, from the top line's top to the bottom line's bottom", () => {
    const { ctx, calls } = recorder()
    const stave = new AlignedStave(0, 0, 200)
    stave.setContext(ctx).draw()
    const bar = calls.find((c) => c.op === 'fillRect')?.args ?? []
    // A 1 px line centred on y has its ink on [y − 0.5, y + 0.5].
    expect([bar[1], bar[1] + bar[3]]).toEqual([stave.getYForLine(0) - 0.5, stave.getYForLine(4) + 0.5])
  })

  it("AlignedStave: a repeat's dots on the centres of the two spaces around the middle line, at both ends", () => {
    const stave = new AlignedStave(0, 0, 200)
    const want = [1.5, 2.5, 1.5, 2.5].map((line) => stave.getYForLine(line))
    expect(repeatDots(drawRepeats(stave))).toEqual(want)
  })

  it('keepRestsOnTheirLines: a beamed rest and a rest in a tuplet go back to the middle line they were written on', () => {
    const stave = new AlignedStave(0, 0, 200)
    for (const notes of [beamedBeat(stave), triplet(stave)]) {
      keepRestsOnTheirLines(notes)
      expect(notes[1].getKeyLine(0)).toBe(3)
      expect(notes[1].getYs()).toEqual([stave.getYForLine(2)])
      // the notes around it stay in their space
      expect(notes[0].getKeyLine(0)).toBe(3.5)
    }
  })

  it("AlignedBeam: every line that runs to a stem ends on that stem's outer edge, and starts on the first one's", () => {
    const { notes, calls } = drawBeamedBeat(true)
    expect(beamStarts(calls)).toEqual([stemLeft(notes[0]), stemLeft(notes[0])])
    expect(beamEnds(calls)).toEqual([stemRight(notes[3]), stemRight(notes[3])])
  })

  it("AlignedBeam: a partial beam — a sixteenth's stub before a dotted eighth — keeps VexFlow's length", () => {
    const draw = (Kind: typeof Beam) => {
      const { ctx, calls } = recorder()
      const stave = new Stave(0, 0, 300)
      const notes = [snare('16'), new StaveNote({ keys: ['c/5'], duration: '8d', stemDirection: Stem.UP })]
      const beam = new Kind(notes, false)
      const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables(notes)
      new Formatter().joinVoices([voice]).formatToStave([voice], stave)
      beam.setContext(ctx).draw()
      return { notes, ends: beamEnds(calls) }
    }
    const plain = draw(Beam)
    const aligned = draw(AlignedBeam)
    // the eighth line runs to the dotted eighth's stem; the sixteenth line is a stub off the first
    expect(aligned.ends[0]).toBe(stemRight(aligned.notes[1]))
    expect(aligned.ends[1]).toBe(plain.ends[1])
  })

  it("AlignedGraceNoteGroup: a drag's beam ends on its second grace note's outer edge", () => {
    const { ctx, calls } = recorder()
    const stave = new AlignedStave(0, 0, 300)
    const note = snare('q')
    const graces = [0, 1].map(() => new GraceNote({ keys: ['c/5'], duration: '16', stemDirection: Stem.UP }))
    note.addModifier(new AlignedGraceNoteGroup(graces, true).beamNotes(), 0)
    const voice = new Voice({ numBeats: 1, beatValue: 4 }).addTickables([note])
    new Formatter().joinVoices([voice]).formatToStave([voice], stave)
    voice.draw(ctx, stave)
    const ends = beamEnds(calls)
    expect(ends.length).toBe(2)
    for (const end of ends) expect(end).toBe(stemRight(graces[1]))
  })

  it("anchorStems: an up stem starts at Bravura's stemUpSE anchor, 0.168 spaces above its notehead's centre, and ends where it did", () => {
    const before = recorder()
    drawNote(new AlignedStave(0, 0, 200), before.ctx, false)
    const after = recorder()
    const { note } = drawNote(new AlignedStave(0, 0, 200), after.ctx, true)
    // 0.168 spaces of 10 px.
    expect(movesIn(after.calls, 'stem')[0]).toBeCloseTo(note.getYs()[0] - 1.68, 9)
    expect(linesIn(after.calls, 'stem')).toEqual(linesIn(before.calls, 'stem'))
  })

  it("anchorStems: a grace note's stem starts at the same anchor at the grace note's size", () => {
    const { ctx, calls } = recorder()
    const { grace } = drawNote(new AlignedStave(0, 0, 200), ctx, true, 1)
    const graceY = grace?.getYs()[0] ?? Number.NaN
    // A SMuFL em is four staff spaces: a grace note drawn at 2/3 of the 40 px font has 6.67 px spaces.
    const want = graceY - (0.168 * (40 * (2 / 3))) / 4
    const nearest = movesIn(calls, 'stem').reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a))
    expect(nearest).toBeCloseTo(want, 9)
  })
})
