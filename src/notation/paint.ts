import type { Grade, Judged } from '../engine/types'

export const GRADE_COLORS: Record<Grade, string> = { good: '#2a2', ok: '#c90', off: '#d33', miss: '#888', pending: '#000' }

interface PaintNode {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

/** Il gruppo SVG di una nota (o qualunque cosa risponda a querySelectorAll). */
export interface PaintTarget {
  querySelectorAll(selector: string): Iterable<PaintNode>
}

/** Testa, gambo, bandierina e modificatori stanno nel gruppo della nota: colora fill e, dove c'è, stroke. */
export function paintColor(el: PaintTarget, color: string): void {
  for (const c of el.querySelectorAll('path, text, rect')) {
    c.setAttribute('fill', color)
    const stroke = c.getAttribute('stroke')
    if (stroke && stroke !== 'none') c.setAttribute('stroke', color)
  }
}

/** Applica solo i grade diversi da `last` e aggiorna `last`. Restituisce quante note ha toccato. */
export function paintDiff(judged: Judged[], elementOf: (slotIndex: number) => PaintTarget | undefined, last: Map<number, Grade>): number {
  let touched = 0
  for (const j of judged) {
    const i = j.slot.index
    if (last.get(i) === j.grade) continue
    if (j.grade === 'pending' && !last.has(i)) {
      last.set(i, j.grade)
      continue
    }
    const el = elementOf(i)
    if (!el) continue
    paintColor(el, GRADE_COLORS[j.grade])
    last.set(i, j.grade)
    touched++
  }
  return touched
}
