// Dev page: one section per notation the engraver draws, each a small score that isolates what its
// title promises — the manual check of `src/notation/engrave.ts`, which `bun test` cannot run (no
// DOM). Tasks 6 and 7 add the library and the measurements the layout constants come from.
import { engraveRow } from '../src/notation/engrave'
import { fit } from '../src/notation/fit'
import { buildLayout, type Layout, SYSTEM_H } from '../src/notation/layout'
import { notationFontsReady } from '../src/notation/render'
import { RowPool } from '../src/notation/rows'
import { resolveInstruments } from '../src/score/instruments'
import type { Score } from '../src/score/types'
import { type Figure, GALLERY } from './gallery-scores'

interface Shown {
  layout: Layout
  scale: number
}

/** Engraves a whole score into `host` at the scale that fits its width, every row alive. */
function show(host: HTMLElement, score: Score): Shown {
  // 0 while the host is not in layout yet: a wide fallback rather than one bar per row.
  const availW = host.clientWidth || 1200
  const f = fit(availW, Number.POSITIVE_INFINITY, { barsPerRow: 'auto', rowsPerViewport: 'auto' }, score)
  const layout = buildLayout(score, { barsPerRow: f.barsPerRow, auto: true })
  host.replaceChildren()
  host.style.height = `${layout.rows.length * SYSTEM_H * f.scale}px`
  const catalogue = resolveInstruments(score)
  const pool = new RowPool(layout.rows.length, (r) =>
    engraveRow(host, score, catalogue, layout, layout.rows[r], f.scale),
  )
  pool.ensure(0, layout.rows.length - 1)
  return { layout, scale: f.scale }
}

function section(fig: Figure): { el: HTMLElement; host: HTMLElement } {
  const el = document.createElement('section')
  el.className = 'figure'
  el.id = `fig-${fig.id}`
  const h3 = document.createElement('h3')
  h3.textContent = fig.title
  const p = document.createElement('p')
  p.className = 'expect'
  p.textContent = fig.expect
  const host = document.createElement('div')
  host.className = 'host'
  el.append(h3, p, host)
  return { el, host }
}

function log(s: string): void {
  const pre = document.getElementById('log') as HTMLPreElement
  pre.textContent += `${s}\n`
}

// The music font (Bravura) arrives async via @font-face and VexFlow measures glyphs in the DOM: a
// render before the font is applied nails down wrong coordinates in the SVG.
await notationFontsReady()

const sections = document.getElementById('sections') as HTMLElement
for (const fig of GALLERY) {
  const { el, host } = section(fig)
  sections.appendChild(el)
  try {
    show(host, fig.score)
  } catch (err) {
    // One broken figure must not hide the others: the page keeps going and says which one failed.
    log(`${fig.id}: ${String(err)}`)
    console.error(fig.id, err)
  }
}
