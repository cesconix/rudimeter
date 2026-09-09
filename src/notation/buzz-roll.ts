// Buzz roll: VexFlow has the SMuFL glyph (U+E22A) but no modifier that draws it. Same geometry as Tremolo.
import { Metrics, Modifier, ModifierPosition, Stem } from 'vexflow/bravura'

/**
 * `CATEGORY` deliberately returns `'Tremolo'`: it inherits that modifier's spacing geometry, and
 * `ModifierContext` does not treat the `'Tremolo'` category specially, so there are no side effects
 * on layout. The cost: `note.getModifiersByType('Tremolo')` would return `BuzzRoll` instances
 * indistinguishable from a real `Tremolo`. Nobody queries it today, but whoever does tomorrow
 * should know it.
 */
export class BuzzRoll extends Modifier {
  static override get CATEGORY(): string {
    return 'Tremolo'
  }

  constructor() {
    super()
    this.position = ModifierPosition.CENTER
    this.text = '\ue22a' // SMuFL buzzRoll: VexFlow has it in Glyphs but the entry does not export it
  }

  override draw(): void {
    const ctx = this.checkContext()
    const note = this.checkAttachedNote()
    this.setRendered()
    const dir = note.getStemDirection()
    const scale = note.getFontScale()
    const x = note.getAbsoluteX() + (dir === Stem.UP ? note.getGlyphWidth() - Stem.WIDTH / 2 : Stem.WIDTH / 2)
    const y = note.getStemExtents().topY + Metrics.get('Tremolo.spacing') * dir * scale
    this.fontInfo.size = Metrics.get('Tremolo.fontSize') * scale
    this.renderText(ctx, x, y)
  }
}
