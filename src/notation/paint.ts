import type { Grade, Judged } from '../engine/types'

export const GRADE_COLORS: Record<Grade, string> = {
  good: '#2a2',
  ok: '#c90',
  off: '#d33',
  miss: '#888',
  pending: '#000',
}

interface PaintNode {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

/** The SVG group of a note (or anything that responds to querySelectorAll). */
export interface PaintTarget {
  querySelectorAll(selector: string): Iterable<PaintNode>
}

/** Notehead, stem, flag and modifiers all live in the note's group: colours fill and, where present, stroke. */
export function paintColor(el: PaintTarget, color: string): void {
  for (const c of el.querySelectorAll('path, text, rect')) {
    c.setAttribute('fill', color)
    const stroke = c.getAttribute('stroke')
    if (stroke && stroke !== 'none') c.setAttribute('stroke', color)
  }
}

/**
 * Applies only the grades that differ from `last` and updates `last`. Returns how many notes it touched.
 *
 * `last` is the memory of what *this* SVG shows: create it and throw it away together with the SVG
 * it describes. There is no re-pass that repaints everything, so if the two lives drift apart the
 * divergence is permanent and silent. A `last` that survives a new render leaves notes never
 * coloured (the grade matches, so the drawing is skipped); a fresh `last` on an already coloured SVG
 * leaves the old colours, because the first `pending` of an index never seen before updates the
 * memory without drawing, assuming the note is still at VexFlow's default black.
 *
 * A note whose element is missing is not counted and is retried on every call: fine for a passing
 * absence, but if that index simply does not exist in the SVG, the note stays black — indistinguishable
 * from `pending` — forever, and the return value does not tell that case apart from
 * "there was nothing to do".
 */
export function paintDiff(
  judged: Judged[],
  elementOf: (slotIndex: number) => PaintTarget | undefined,
  last: Map<number, Grade>,
): number {
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
