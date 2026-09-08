import { describe, expect, it } from 'vitest'
import { GRADE_COLORS, paintColor, paintDiff, type PaintTarget } from './paint'
import type { Grade, Judged, Slot } from '../engine/types'

function fakeEl(children: { stroke?: string }[]) {
  const nodes = children.map((c) => {
    const attrs: Record<string, string> = c.stroke ? { stroke: c.stroke } : {}
    return { attrs, getAttribute: (n: string) => attrs[n] ?? null, setAttribute: (n: string, v: string) => { attrs[n] = v } }
  })
  const el: PaintTarget = { querySelectorAll: () => nodes }
  return { el, nodes }
}

describe('paintColor', () => {
  it('colora il fill di tutti i figli e lo stroke solo dove esiste ed è diverso da none', () => {
    const { el, nodes } = fakeEl([{}, { stroke: '#000' }, { stroke: 'none' }])
    paintColor(el, '#2a2')
    expect(nodes.map((n) => n.attrs.fill)).toEqual(['#2a2', '#2a2', '#2a2'])
    expect(nodes.map((n) => n.attrs.stroke)).toEqual([undefined, '#2a2', 'none'])
  })
})

describe('paintDiff', () => {
  const step = { hand: 'R' as const, accent: false }
  const slot = (index: number): Slot => ({ index, t: index, dur: 1, step, repeat: 0, bar: 0, beat: index, sub: 0 })
  const judged = (grades: Grade[]): Judged[] => grades.map((grade, i) => ({ slot: slot(i), hit: null, offsetMs: null, grade }))

  it('tocca solo i grade cambiati e aggiorna la memoria', () => {
    const els = [fakeEl([{}]), fakeEl([{}]), fakeEl([{}])]
    const last = new Map<number, Grade>()
    expect(paintDiff(judged(['pending', 'pending', 'pending']), (i) => els[i].el, last)).toBe(0)
    expect(paintDiff(judged(['good', 'pending', 'miss']), (i) => els[i].el, last)).toBe(2)
    expect(els[0].nodes[0].attrs.fill).toBe(GRADE_COLORS.good)
    expect(els[1].nodes[0].attrs.fill).toBeUndefined()
    expect(els[2].nodes[0].attrs.fill).toBe(GRADE_COLORS.miss)
    expect(paintDiff(judged(['good', 'pending', 'miss']), (i) => els[i].el, last)).toBe(0)
  })
  it('un elemento mancante non blocca gli altri', () => {
    const els = [fakeEl([{}])]
    expect(paintDiff(judged(['good', 'ok']), (i) => els[i]?.el, new Map())).toBe(1)
  })
})
