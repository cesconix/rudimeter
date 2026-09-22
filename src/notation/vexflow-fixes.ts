import {
  Barline,
  Beam,
  GraceNoteGroup,
  Modifier,
  type Note,
  type RenderContext,
  Stave,
  type StaveNote,
  type StaveOptions,
  Stem,
  type StemmableNote,
  VexFlow,
} from 'vexflow/bravura'

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
 * `getTopLineTopY` and `getBottomLineBottomY`, which answer its edges around those centres, and
 * are `AlignedBarline`s, whose repeat dots sit in their spaces.
 */
export class AlignedStave extends Stave {
  constructor(x: number, y: number, width: number, options?: StaveOptions) {
    super(x, y, width, options)
    this.setConfigForLines(Array.from({ length: this.getNumLines() }, () => ({ visible: false })))
    // The begin and end barlines are VexFlow's first two modifiers, built by its constructor;
    // `setBegBarType` and `setEndBarType` change their type in place, so replacing them here is enough.
    for (const i of [0, 1]) {
      const plain = this.modifiers[i] as Barline
      this.modifiers[i] = new AlignedBarline(plain.getType()).setPosition(plain.getPosition()).setStave(this)
    }
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
 * A barline whose repeat dots sit on the centres of the two spaces around the middle line. VexFlow
 * 5.0.0's `drawRepeatBar` puts them at the top line's top + 1.5 spaces + half the dot's radius: 1 px
 * below those centres on its own stave, 0.5 px on `AlignedStave` (measured in the gallery: 95.5 and
 * 105.5 px against 95 and 105). This is that method with the dots' y changed and nothing else: the
 * two bars and the dots' x and radius are VexFlow's.
 */
class AlignedBarline extends Barline {
  override drawRepeatBar(stave: Stave, x: number, begin: boolean): void {
    const ctx = stave.checkContext()
    const topY = stave.getTopLineTopY()
    const botY = stave.getBottomLineBottomY()
    const xShift = begin ? 3 : -5
    ctx.fillRect(x + xShift, topY, 1, botY - topY)
    ctx.fillRect(x - 2, topY, 3, botY - topY)
    const dotRadius = 2
    const dotX = x + xShift + (begin ? 4 : -4) + dotRadius / 2
    const middle = (stave.getNumLines() - 1) / 2
    for (const line of [middle - 0.5, middle + 0.5]) {
      ctx.beginPath()
      ctx.arc(dotX, stave.getYForLine(line), dotRadius, 0, Math.PI * 2, false)
      ctx.fill()
    }
  }
}

/**
 * A beam whose lines end on the outer edge of the stem they run to. VexFlow 5.0.0's `drawBeamLines`
 * ends such a line at the stem's left edge + 1 px, the right edge of a 1 px stem, but its stems are
 * `Stem.WIDTH`, 1.5 px: the last stem stood 0.5 px past the beam's end, a step in the beam's outer
 * corner (measured in the gallery on all 92 beams). This is that method with those lines' end
 * changed and nothing else: a partial beam (a sixteenth's stub) keeps VexFlow's length, and each
 * line's y is still read at VexFlow's end.
 */
export class AlignedBeam extends Beam {
  protected override drawBeamLines(ctx: RenderContext): void {
    const stemLefts = new Set(this.notes.map((note) => note.getStemX() - Stem.WIDTH / 2))
    const firstStemX = this.notes[0].getStemX()
    const thickness = this.renderOptions.beamWidth * this.getStemDirection()
    let beamY = this.getBeamYToDraw()
    for (const duration of ['4', '8', '16', '32', '64']) {
      for (const { start, end } of this.getBeamLines(duration)) {
        if (end === undefined) throw new Error('AlignedBeam: a beam line with no end')
        const x = end > start && stemLefts.has(end) ? end + Stem.WIDTH : end + 1
        const startY = this.getSlopeY(start, firstStemX, beamY, this.slope)
        const endY = this.getSlopeY(end, firstStemX, beamY, this.slope)
        ctx.beginPath()
        ctx.moveTo(start, startY)
        ctx.lineTo(start, startY + thickness)
        ctx.lineTo(x, endY + thickness)
        ctx.lineTo(x, endY)
        ctx.closePath()
        ctx.fill()
      }
      beamY += thickness * 1.5
    }
  }
}

/**
 * `GraceNoteGroup.format`'s air between a grace group and its note on a stave (`groupSpacingStave`),
 * a local constant there: part of the left shift VexFlow reserves for the group.
 */
const GRACE_GROUP_SPACING = 4

/**
 * Grace notes that sit against their note, and whose beam is an `AlignedBeam`.
 *
 * Placement: VexFlow 5.0.0's `alignSubNotesWithNote` puts the group at the note's x minus every
 * modifier width its note reserves on both sides (`modLeftPx + modRightPx`), where the group's own
 * shift is only one of them: a text over the note (`Annotation.format` reserves half its width on
 * each side) or the note's dots pushed the grace notes away from it — a flam 43 px left of a quarter
 * under "Flam accent", 5 px per dot (measured in the gallery). Here the group's own shift is the only
 * one, which is what VexFlow computes for a note that carries nothing else.
 *
 * Beam: `GraceNoteGroup.beamNotes` builds a plain `Beam` inside VexFlow, out of the engraver's reach.
 * Its beam is rebuilt as an `AlignedBeam` over the same notes with the same options, so what VexFlow
 * sets there (a thinner beam, a shorter stub) still holds.
 */
export class AlignedGraceNoteGroup extends GraceNoteGroup {
  override alignSubNotesWithNote(subNotes: Note[], note: Note, position = Modifier.Position.LEFT): void {
    if (position !== Modifier.Position.LEFT) {
      super.alignSubNotesWithNote(subNotes, note, position)
      return
    }
    const ownShift = this.getWidth() + GRACE_GROUP_SPACING
    const x = note.getTickContext().getX() - ownShift + this.getSpacingFromNextModifier()
    const stave = note.getStave()
    for (const sub of subNotes) {
      if (stave) sub.setStave(stave)
      sub.getTickContext().setXOffset(x)
    }
  }

  override beamNotes(graceNotes?: StemmableNote[]): this {
    super.beamNotes(graceNotes)
    this.beams = this.beams.map((beam) => {
      if (beam instanceof AlignedBeam) return beam
      const aligned = new AlignedBeam(beam.notes)
      Object.assign(aligned.renderOptions, beam.renderOptions)
      return aligned
    })
    return this
  }
}

/**
 * Puts every rest back on the line it was written on. VexFlow 5.0.0 moves a rest to its neighbouring
 * notes' line when it sits under a beam (`formatToStave` → `Formatter.AlignRestsToNotes`, which aligns
 * a beamed rest whatever the options say) or inside a tuplet (`Tuplet`'s constructor): with the snare
 * in a space that is half a space up, so the rest is no longer where the score writes it, a
 * sixteenth rest's dots land on lines instead of in spaces, and two rests of one beam sit at two
 * heights (measured in the gallery: 95 and 100 px). The written line comes from the rest's own key,
 * which VexFlow leaves as it was built, read as VexFlow read it (the default clef: the app's notes
 * set none). Call it after formatting, before drawing.
 */
export function keepRestsOnTheirLines(notes: StaveNote[]): void {
  for (const note of notes) {
    if (!note.isRest()) continue
    const written: number = VexFlow.keyProperties(note.getKeys()[0]).line
    if (note.getKeyLine(0) !== written) note.setKeyLine(0, written)
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
