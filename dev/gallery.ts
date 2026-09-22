// Dev page: one section per notation the engraver draws, each a small score that isolates what its
// title promises — the manual check of `src/notation/engrave.ts`, which `bun test` cannot run (no
// DOM) — plus the library whole and the measurements the layout constants come from.

import { SCORES } from '../src/data/scores'
import { type EngravedRow, engraveRow, measureHead, measureInk, measurePad } from '../src/notation/engrave'
import { fit } from '../src/notation/fit'
import { notationFontsReady } from '../src/notation/fonts'
import {
  BAR_PAD,
  buildLayout,
  CURSOR_ABOVE,
  CURSOR_BELOW,
  HEAD_PX,
  METER_PX,
  STAFF_H,
  STAFF_TOP,
  SYSTEM_H,
} from '../src/notation/layout'
import { playbackBarAt } from '../src/notation/overlay'
import { deferEnsure, RowPool } from '../src/notation/rows'
import { toNumber } from '../src/score/fraction'
import { buildTimeMap } from '../src/score/timemap'
import type { Score } from '../src/score/types'
import { barStarts, unroll } from '../src/score/unroll'
import { CURSOR_PROBE, type Figure, GALLERY, WORST_CASE } from './gallery-scores'

/**
 * The layout `score` gets in `host`: the rows justified to its width, as the app's to the frame, so
 * a figure is checked as the app draws it. A figure's pin is the exception: its sentence names the
 * barlines on a row, so the row holds that many bars at every width, shrunk when they do not fit —
 * where the app, whose bars per row is a ceiling (`fit`), would wrap them. A pin fixes how many bars
 * a row takes, never its breaks: only a user's saved preference in the app may drop a figure's
 * `newRow` marks, so the gallery always honours them.
 */
function laidOut(host: HTMLElement, score: Score, pin?: number) {
  // 0 while the host is not in layout yet: a wide fallback rather than one bar per row.
  const availW = host.clientWidth || 1200
  if (pin === undefined) {
    const f = fit(availW, Number.POSITIVE_INFINITY, 'auto', score)
    return {
      scale: f.scale,
      layout: buildLayout(score, { barsPerRow: f.barsPerRow, auto: true, fillWidth: availW / f.scale }),
    }
  }
  const natural = buildLayout(score, { barsPerRow: pin, auto: true })
  const scale = Math.min(1, availW / Math.max(...natural.rows.map((r) => r.widthNatural)))
  return { scale, layout: buildLayout(score, { barsPerRow: pin, auto: true, fillWidth: availW / scale }) }
}

/** Engraves a whole score into `host` at the scale that fits its width, every row alive; the caller owns the pool. */
function show(host: HTMLElement, score: Score, pin?: number): RowPool<EngravedRow> {
  const { scale, layout } = laidOut(host, score, pin)
  host.replaceChildren()
  host.style.height = `${layout.rows.length * SYSTEM_H * scale}px`
  const pool = new RowPool(layout.rows.length, (r) => engraveRow(host, score, layout, layout.rows[r], scale))
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

/** A host on the page and what it draws: every panel is redrawn when the page's width changes. */
interface Panel {
  /** for the log, when the engraving throws */
  id: string
  host: HTMLElement
  score: Score
  /** the figure's bars per row, exact (`laidOut`); none draws it as the app would */
  pin?: number
  pool?: RowPool<EngravedRow>
}
const panels: Panel[] = []

function draw(panel: Panel): void {
  // `show` replaces the host's children on every call anyway, so the previous SVGs are dropped
  // regardless — but the pool itself must not keep owning rows it no longer draws into.
  panel.pool?.invalidate()
  panel.pool = undefined
  try {
    panel.pool = show(panel.host, panel.score, panel.pin)
  } catch (err) {
    // One broken figure must not hide the others: the page keeps going and says which one failed.
    log(`${panel.id}: ${String(err)}`)
    console.error(panel.id, err)
  }
}

// The width the panels are drawn for: `fit` reads it synchronously in `show`, so the value taken
// here is the one every panel below is laid out on.
let drawnW = document.body.clientWidth

const sections = document.getElementById('sections') as HTMLElement
for (const fig of GALLERY) {
  const { el, host } = section(fig)
  sections.appendChild(el)
  const panel: Panel = { id: fig.id, host, score: fig.score, pin: fig.barsPerRow }
  panels.push(panel)
  draw(panel)
}

const pick = document.getElementById('pick') as HTMLSelectElement
for (const score of SCORES) {
  const option = document.createElement('option')
  option.value = score.id
  option.textContent = score.source ? `${score.title} — ${score.source}` : score.title
  pick.appendChild(option)
}
const library: Panel = {
  id: 'library',
  host: document.getElementById('library') as HTMLElement,
  score: SCORES[0],
}
panels.push(library)
const showPicked = () => {
  library.score = SCORES.find((s) => s.id === pick.value) ?? SCORES[0]
  draw(library)
}
pick.addEventListener('change', showPicked)
// The book page first: 50 Workout #43 is the one piece with rests, dotted spellings and two repeated sections.
pick.value = 'workout-43'
showPicked()

/** Rotating the iPad emits many resizes in a row, and every one would re-engrave twelve figures and the library. */
const RESIZE_DEBOUNCE_MS = 150
// The width decides bars per row and scale (`fit`), so a rotation or a narrower window is a new
// layout for every panel, as it is for the app's frame in `ScoreView`. Width only: the gallery has
// no viewport height, every row of every figure is on the page — and the body's height changes
// with every panel drawn, which is exactly what must not redraw them again.
let pendingResize = 0
new ResizeObserver(() => {
  clearTimeout(pendingResize)
  pendingResize = window.setTimeout(() => {
    if (document.body.clientWidth === drawnW) return
    drawnW = document.body.clientWidth
    for (const panel of panels) draw(panel)
  }, RESIZE_DEBOUNCE_MS)
}).observe(document.body)

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
  // Every row stacked as the app stacks them, one band apart: what one row's ink leaves to the next is on the page.
  const layout = buildLayout(WORST_CASE.score, { barsPerRow: WORST_CASE.barsPerRow ?? 8, auto: true })
  host.replaceChildren()
  host.style.height = `${layout.rows.length * SYSTEM_H}px`
  const inks = layout.rows.map((row) => {
    engraveRow(host, WORST_CASE.score, layout, row, 1)
    return measureInk(WORST_CASE.score, layout, row)
  })
  const top = Math.min(...inks.map((ink) => ink.top))
  const bottom = Math.max(...inks.map((ink) => ink.bottom))
  const rows = inks.map((ink, r) => `row ${r + 1} ${ink.top.toFixed(1)}–${ink.bottom.toFixed(1)}`).join(', ')
  log(
    `band: ink from y = ${top.toFixed(1)} to ${bottom.toFixed(1)} px (pixels; ${rows}); band is [0, ${SYSTEM_H}] with the top line at ${STAFF_TOP}; ` +
      `ink ${(STAFF_TOP - top).toFixed(1)} px above the top line, ${(bottom - STAFF_TOP - STAFF_H).toFixed(1)} px below the bottom one; ` +
      `overflow above ${Math.max(0, -top).toFixed(1)} px, below ${Math.max(0, bottom - SYSTEM_H).toFixed(1)} px`,
  )
})

on('measure-cursor', () => {
  const host = document.getElementById('cursor') as HTMLElement
  const layout = buildLayout(CURSOR_PROBE.score, { barsPerRow: 2, auto: true })
  host.replaceChildren()
  host.style.height = `${SYSTEM_H}px`
  engraveRow(host, CURSOR_PROBE.score, layout, layout.rows[0], 1)
  // The second bar only: the first carries the clef, the signature and the bar number, which the cursor does not cover.
  const second = layout.rows[0].bars[1]
  const { top, bottom } = measureInk(CURSOR_PROBE.score, layout, layout.rows[0], [
    second.x - second.head,
    second.x + second.width,
  ])
  const above = STAFF_TOP - top
  const below = bottom - (STAFF_TOP + STAFF_H)
  log(
    `cursor: ink ${above.toFixed(1)} px above the top line, ${below.toFixed(1)} px below the bottom one (pixels, second bar); ` +
      `CURSOR_ABOVE is ${CURSOR_ABOVE}, CURSOR_BELOW is ${CURSOR_BELOW}; ` +
      `overflow above ${Math.max(0, above - CURSOR_ABOVE).toFixed(1)} px, below ${Math.max(0, below - CURSOR_BELOW).toFixed(1)} px`,
  )
})

on('measure-edges', () => {
  // Every row the gallery draws — the twelve figures at their hosts' width, every library piece at
  // the library's — measured from pixels against its own box [0, width]: a row is a component with
  // no spacing on its perimeter, so its ink must start on the left edge and end on the right one,
  // and nothing — a bar number, a "×N", a text or a sticking letter on the last note, a tie — may
  // leave it. Natural px: the row is drawn at scale 1, as the band is.
  const library = document.getElementById('library') as HTMLElement
  const jobs = [
    ...GALLERY.map((fig) => ({
      id: fig.id,
      host: (document.querySelector(`#fig-${fig.id} .host`) as HTMLElement | null) ?? library,
      score: fig.score,
      pin: fig.barsPerRow,
    })),
    ...SCORES.map((score) => ({ id: `library/${score.id}`, host: library, score, pin: undefined })),
  ]
  let rows = 0
  const worst = { outLeft: 0, outRight: 0, gapLeft: 0, gapRight: 0 }
  const where = { outLeft: '-', outRight: '-', gapLeft: '-', gapRight: '-' }
  const note = (key: keyof typeof worst, value: number, at: string) => {
    if (value > worst[key]) {
      worst[key] = value
      where[key] = at
    }
  }
  for (const job of jobs) {
    const { layout } = laidOut(job.host, job.score, job.pin)
    for (const row of layout.rows) {
      rows++
      const { left, right } = measureInk(job.score, layout, row)
      const at = `${job.id} row ${row.index + 1}`
      note('outLeft', -left, at)
      note('outRight', right - row.widthNatural, at)
      note('gapLeft', left, at)
      note('gapRight', row.widthNatural - right, at)
    }
  }
  const px = (key: keyof typeof worst) => `${worst[key].toFixed(1)} px (${where[key]})`
  log(
    `edges: ${rows} rows; ink out of the row at most ${px('outLeft')} on the left, ${px('outRight')} on the right; ` +
      `blank inside the row at most ${px('gapLeft')} on the left, ${px('gapRight')} on the right; ` +
      // A row's width is rarely a whole number of device pixels: the barline's last, partly covered
      // column reads as painted, so anything under one device pixel is the reading, not ink.
      `resolution ${(1 / (window.devicePixelRatio || 1)).toFixed(2)} px`,
  )
})

/** Engraves `score` into `host` with every row timed; returns what the motion loop needs. */
function timed(host: HTMLElement, viewport: HTMLElement, score: Score) {
  const availW = viewport.clientWidth || 1200
  const f = fit(availW, viewport.clientHeight || 3 * SYSTEM_H, 'auto', score)
  const layout = buildLayout(score, { barsPerRow: f.barsPerRow, auto: true, fillWidth: availW / f.scale })
  const rowH = SYSTEM_H * f.scale
  host.replaceChildren()
  host.style.height = `${layout.rows.length * rowH}px`
  const times: number[] = []
  const pool = new RowPool(layout.rows.length, (r) => {
    const t = performance.now()
    const row = engraveRow(host, score, layout, layout.rows[r], f.scale)
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
 * engraving on demand fits between frames — not the cursor, which is the app's.
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
