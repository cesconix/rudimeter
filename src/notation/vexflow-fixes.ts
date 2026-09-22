import { GraceNoteGroup, Stave, type StaveNote, type StaveOptions, Stem } from 'vexflow/bravura'

/*
 * Every place where VexFlow 5.0.0's geometry disagrees with the music font's, corrected in one
 * module: nothing else in the app works around VexFlow. Each fix puts the ink where the font says
 * it goes — an absolute value, never a delta on VexFlow's — so a VexFlow that fixes the defect
 * itself draws the same thing. Each has a test in `vexflow-fixes.test.ts` that fails when VexFlow no
 * longer has the defect: that failure is the signal to delete the fix. `vexflow` is pinned to an
 * exact version in package.json for the same reason: an upgrade is a pull request that runs those
 * tests, never a side effect of `bun update`.
 */

/**
 * A stave whose lines are centred where its glyphs expect them. VexFlow 5.0.0 strokes each 1 px line
 * at `getYForLine(i) + 0.5` (`Stave.draw`'s `lineWidthCorrection`, which keeps a line crisp on a 1×
 * canvas) but centres every glyph — noteheads, rests, clef, time signature — on `getYForLine` and
 * `getYForNote` themselves: a notehead in a space covered the whole line above it and only touched
 * the one below (measured in the gallery: head 90–100 px, the two lines' ink 90–91 and 100–101).
 * VexFlow's lines are hidden and drawn here on `getYForLine`; the barlines take the lines' ink from
 * `getTopLineTopY` and `getBottomLineBottomY`, which answer its edges around those centres.
 */
export class AlignedStave extends Stave {
  constructor(x: number, y: number, width: number, options?: StaveOptions) {
    super(x, y, width, options)
    this.setConfigForLines(Array.from({ length: this.getNumLines() }, () => ({ visible: false })))
  }

  override getTopLineTopY(): number {
    return this.getYForLine(0) - this.lineWidth() / 2
  }

  override getBottomLineBottomY(): number {
    return this.getYForLine(this.getNumLines() - 1) + this.lineWidth() / 2
  }

  override draw(): void {
    const ctx = this.checkContext()
    ctx.openGroup('stave-lines')
    for (let line = 0; line < this.getNumLines(); line++) {
      const y = this.getYForLine(line)
      ctx.beginPath()
      ctx.moveTo(this.getX(), y)
      ctx.lineTo(this.getX() + this.getWidth(), y)
      ctx.stroke()
    }
    ctx.closeGroup()
    super.draw()
  }

  /** The width VexFlow strokes a line with: the same fallback its own correction reads. */
  private lineWidth(): number {
    return this.getStyle().lineWidth ?? 1
  }
}

/**
 * Bravura's `stemUpSE` anchor on `noteheadBlack` and `noteheadHalf` (`Bravura.json`,
 * `glyphsWithAnchors`, font 1.482): where an up stem's bottom-right corner meets the notehead, in
 * staff spaces above the head's centre. Its x, 1.18 spaces, is VexFlow's already: the stem's right
 * edge on the head's.
 */
const STEM_UP_SE_Y = 0.168

/**
 * Starts the up stems of a note and of its grace notes at the font's stem anchor. VexFlow 5.0.0
 * carries no SMuFL anchors and starts every stem at its notehead's centre (`Stem.draw`, with
 * `stemUpYBaseOffset` never set), where the head's outline has already curved away from the stem's
 * right edge: the stem's bottom-right corner showed outside the head, up to 0.38 px at 1× (read on
 * Bravura's outline in the gallery). The offset is VexFlow's own option, set to the anchor at the
 * head's size — a SMuFL em is four staff spaces, so a grace note's anchor shrinks with its font.
 * `setOptions` zeroes VexFlow's other stem offsets, which 5.0.0 leaves at zero anyway: the base is
 * the anchor whatever VexFlow puts there. Call it after formatting, just before drawing: VexFlow
 * builds a new stem whenever it resets a note.
 */
export function anchorStems(note: StaveNote): void {
  anchor(note)
  for (const group of note.getModifiersByType(GraceNoteGroup.CATEGORY) as GraceNoteGroup[]) {
    for (const grace of group.getGraceNotes() as StaveNote[]) anchor(grace)
  }
}

function anchor(note: StaveNote): void {
  const stem = note.getStem()
  if (!stem || note.isRest() || note.getStemDirection() !== Stem.UP) return
  stem.setOptions({ stemUpYBaseOffset: -(STEM_UP_SE_Y * note.fontSizeInPixels) / 4 })
}
