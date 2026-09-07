// Buzz roll: VexFlow ha il glifo SMuFL (U+E22A) ma nessun modificatore che lo disegni. Stessa geometria di Tremolo.
import { Metrics, Modifier, ModifierPosition, Stem } from 'vexflow/bravura'

/**
 * `CATEGORY` ritorna volutamente `'Tremolo'`: eredita la geometria di spaziatura di quel
 * modificatore, e `ModifierContext` non tratta la categoria `'Tremolo'` in modo speciale, quindi
 * non ci sono effetti collaterali sul layout. Il costo: `note.getModifiersByType('Tremolo')`
 * restituirebbe istanze di `BuzzRoll` indistinguibili da un `Tremolo` vero. Nessuno lo interroga
 * oggi, ma un domani che lo facesse dovrebbe saperlo.
 */
export class BuzzRoll extends Modifier {
  static override get CATEGORY(): string {
    return 'Tremolo'
  }

  constructor() {
    super()
    this.position = ModifierPosition.CENTER
    this.text = '\ue22a' // SMuFL buzzRoll: VexFlow lo ha in Glyphs ma l'entry non lo esporta
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
