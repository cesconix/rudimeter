// Dev page: one section per notation the engraver draws, each a small score that isolates what its
// title promises — the manual check of `src/notation/engrave.ts`, which `bun test` cannot run (no
// DOM). Tasks 6 and 7 add the library and the measurements the layout constants come from.

import { SCORES } from '../src/data/scores'
import { type EngravedRow, engraveRow, measureHead, measureInk, measurePad } from '../src/notation/engrave'
import { fit, type Pref } from '../src/notation/fit'
import { notationFontsReady } from '../src/notation/fonts'
import { BAR_PAD, buildLayout, HEAD_PX, METER_PX, STAFF_TOP, SYSTEM_H } from '../src/notation/layout'
import { playbackBarAt } from '../src/notation/overlay'
import { deferEnsure, RowPool } from '../src/notation/rows'
import { toNumber } from '../src/score/fraction'
import { resolveInstruments } from '../src/score/instruments'
import { buildTimeMap } from '../src/score/timemap'
import type { Score } from '../src/score/types'
import { barStarts, unroll } from '../src/score/unroll'
import { type Figure, GALLERY, WORST_CASE } from './gallery-scores'

/** Engraves a whole score into `host` at the scale that fits its width, every row alive; the caller owns the pool. */
function show(host: HTMLElement, score: Score, barsPerRow: Pref = 'auto'): RowPool<EngravedRow> {
  // 0 while the host is not in layout yet: a wide fallback rather than one bar per row.
  const availW = host.clientWidth || 1200
  const f = fit(availW, Number.POSITIVE_INFINITY, { barsPerRow, rowsPerViewport: 'auto' }, score)
  // A pin fixes the row's WIDTH (how many bars fit), never its row breaks: only a user's saved
  // preference in the app may drop a figure's `newRow` marks, so the gallery always honours them.
  const layout = buildLayout(score, { barsPerRow: f.barsPerRow, auto: true })
  host.replaceChildren()
  host.style.height = `${layout.rows.length * SYSTEM_H * f.scale}px`
  const catalogue = resolveInstruments(score)
  const pool = new RowPool(layout.rows.length, (r) =>
    engraveRow(host, score, catalogue, layout, layout.rows[r], f.scale),
  )
  pool.ensure(0, layout.rows.length - 1)
  return pool
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
    show(host, fig.score, fig.barsPerRow ?? 'auto')
  } catch (err) {
    // One broken figure must not hide the others: the page keeps going and says which one failed.
    log(`${fig.id}: ${String(err)}`)
    console.error(fig.id, err)
  }
}

const pick = document.getElementById('pick') as HTMLSelectElement
for (const score of SCORES) {
  const option = document.createElement('option')
  option.value = score.id
  option.textContent = score.source ? `${score.title} — ${score.source}` : score.title
  pick.appendChild(option)
}
const library = document.getElementById('library') as HTMLElement
// `show` replaces the host's children on every call anyway, so the previous SVGs are dropped
// regardless — but the pool itself must not keep owning rows it no longer draws into.
let libraryPool: RowPool<EngravedRow> | undefined
const showPicked = () => {
  const score = SCORES.find((s) => s.id === pick.value) ?? SCORES[0]
  libraryPool?.invalidate()
  libraryPool = show(library, score)
}
pick.addEventListener('change', showPicked)
// The kit groove first: the one piece with two voices and an ending, the spec's "full two-voice kit exercise".
pick.value = 'kit-ending'
showPicked()

// --- Measurements: dev-only, `performance.now()` is fine here (nothing in the app reads these) ---

/** The piece with the most bars: the pyramids, thirty bars of sixteenths. */
const LONGEST = SCORES.reduce((a, b) => (b.bars.length > a.bars.length ? b : a))

function on(id: string, handler: () => void): void {
  // biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
  document.getElementById(id)!.addEventListener('click', handler)
}

on('measure-head', () => {
  const head = measureHead(true, '12/8')
  const meter = measureHead(false, '12/8')
  log(
    `head: clef + 12/8 need ${head.toFixed(1)} px, HEAD_PX is ${HEAD_PX}; 12/8 alone needs ${meter.toFixed(1)} px, METER_PX is ${METER_PX}; clef + 4/4 need ${measureHead(true, '4/4').toFixed(1)} px; VexFlow's Stave.padding is ${measurePad().toFixed(1)} px, BAR_PAD is ${BAR_PAD}`,
  )
})

on('measure-band', () => {
  const host = document.getElementById('band') as HTMLElement
  // Scale 1 on purpose, on the page for the eye and on pixels for the numbers: a text box in the
  // SVG is the font's em box, not the ink, so `getBBox()` would over-reserve by ≈80 px.
  const layout = buildLayout(WORST_CASE.score, { barsPerRow: 8, auto: true })
  host.replaceChildren()
  host.style.height = `${SYSTEM_H}px`
  const catalogue = resolveInstruments(WORST_CASE.score)
  engraveRow(host, WORST_CASE.score, catalogue, layout, layout.rows[0], 1)
  const { top, bottom } = measureInk(WORST_CASE.score, catalogue, layout, layout.rows[0])
  log(
    `band: ink from y = ${top.toFixed(1)} to ${bottom.toFixed(1)} px (pixels); band is [0, ${SYSTEM_H}] with the top line at ${STAFF_TOP}; ` +
      `overflow above ${Math.max(0, -top).toFixed(1)} px, below ${Math.max(0, bottom - SYSTEM_H).toFixed(1)} px`,
  )
})

/** Engraves `score` into `host` with every row timed; returns what the motion loop needs. */
function timed(host: HTMLElement, viewport: HTMLElement, score: Score) {
  const f = fit(
    viewport.clientWidth || 1200,
    viewport.clientHeight || 3 * SYSTEM_H,
    { barsPerRow: 'auto', rowsPerViewport: 'auto' },
    score,
  )
  const layout = buildLayout(score, { barsPerRow: f.barsPerRow, auto: true })
  const rowH = SYSTEM_H * f.scale
  host.replaceChildren()
  host.style.height = `${layout.rows.length * rowH}px`
  const catalogue = resolveInstruments(score)
  const times: number[] = []
  const pool = new RowPool(layout.rows.length, (r) => {
    const t = performance.now()
    const row = engraveRow(host, score, catalogue, layout, layout.rows[r], f.scale)
    times.push(performance.now() - t)
    return row
  })
  return { f, layout, rowH, pool, times }
}

const stats = (times: number[]) =>
  times.length === 0
    ? 'no row engraved'
    : `${times.length} rows, max ${Math.max(...times).toFixed(1)} ms, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} ms`

on('measure-engrave', () => {
  const viewport = document.getElementById('motion') as HTMLElement
  const host = document.getElementById('motion-host') as HTMLElement
  viewport.style.height = `${3 * SYSTEM_H}px`
  const { layout, pool, times } = timed(host, viewport, LONGEST)
  const t = performance.now()
  pool.ensure(0, layout.rows.length - 1)
  log(`engrave ${LONGEST.id}: ${(performance.now() - t).toFixed(1)} ms in all; ${stats(times)}`)
})

/**
 * The viewport follows the row the cursor would be on at 120 bpm, through the pool, off the frame
 * step (`deferEnsure`), for 30 s: in scroll mode the row anchors at the top, in pages mode the page
 * turns when the row leaves it and the next page is kept engraved. What is measured is whether
 * engraving on demand fits between frames — the question the canvas-rows task waits on — not the
 * cursor, which is plan 11.
 */

/** One motion run at a time: a second click would drive two loops through one pool and count each other's frames. */
let running = false

function motion(mode: 'scroll' | 'pages'): void {
  if (running) {
    log(`${mode}: a run is in progress`)
    return
  }
  running = true
  const viewport = document.getElementById('motion') as HTMLElement
  const host = document.getElementById('motion-host') as HTMLElement
  viewport.style.height = `${3 * SYSTEM_H}px`
  const { f, layout, rowH, pool, times } = timed(host, viewport, LONGEST)
  // The same call the app makes (ScoreView): the row is asked for off the frame step, so what is
  // measured is the app's scheduling, not engraving inside the rAF callback.
  const deferred = deferEnsure(pool)
  const playback = unroll(LONGEST)
  const map = buildTimeMap(LONGEST, playback, 120)
  const starts = barStarts(LONGEST, playback).map(toNumber)
  const rowAt = (seconds: number): number =>
    layout.rowOfBar[playback[playbackBarAt(starts, map.positionAt(seconds))].barIndex]
  const last = layout.rows.length - 1
  let frames = 0
  let dropped = 0
  const t0 = performance.now()
  let prev = t0
  pool.ensure(0, f.rowsVisible - 1)
  const step = () => {
    // `running` must clear on every exit, not just the normal one: a throw here (a bad row index,
    // say) would otherwise leave it stuck at true and both buttons would log "a run is in progress" forever.
    try {
      const now = performance.now()
      frames++
      if (now - prev > 20) dropped++
      prev = now
      const s = (now - t0) / 1000
      const row = rowAt(s)
      if (mode === 'scroll') {
        viewport.scrollTop = row * rowH
        deferred.ensure(row, Math.min(last, row + f.rowsVisible - 1))
      } else {
        const first = Math.floor(row / f.rowsVisible) * f.rowsVisible
        viewport.scrollTop = first * rowH
        deferred.ensure(first, Math.min(last, first + 2 * f.rowsVisible - 1))
      }
      if (s < 30 && s < map.end) requestAnimationFrame(step)
      else {
        running = false
        log(`${mode}: ${s.toFixed(1)} s, ${frames} frames, ${dropped} intervals > 20 ms; engraved ${stats(times)}`)
      }
    } catch (err) {
      running = false
      throw err
    }
  }
  requestAnimationFrame(step)
}

on('measure-scroll', () => motion('scroll'))
on('measure-pages', () => motion('pages'))
