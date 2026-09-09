// Dev page: gallery of every note that notation/plan + notation/build can produce (manual visual
// check, VexFlow draws into the DOM) and measurement checks (rendering 40 bars, DOM recolouring at
// 20 notes/s, scroll with translateX) inherited from the original spike.
//
// The "scroll" check remains a frame-rate measurement on a horizontal translateX: production no
// longer scrolls that way (the score wraps and scrolls vertically via `scrollTop`, see Score), but
// the number this button produces — how many frames drop while a promoted layer moves — still holds.

import type { StaveNote } from 'vexflow/bravura'
import { parseExercise } from '../src/engine/exercise'
import type { Exercise } from '../src/engine/types'
import { paintColor } from '../src/notation/paint'
import { planExercise } from '../src/notation/plan'
import { notationFontsReady, type RenderedScore, renderScore } from '../src/notation/render'

// --- Exercises for the measurement checks ("1 bar" / "40 bars" buttons) ---

const SHOWCASE = parseExercise({
  id: 'showcase',
  name: 'showcase',
  timeSignature: [4, 4],
  steps: '>fRLRL dRLR zR- tRtL',
  repeats: 1,
})
const PARADIDDLE = parseExercise({
  id: 'para',
  name: 'para',
  timeSignature: [4, 4],
  steps: '>RLRR >LRLL >RLRR >LRLL',
  repeats: 40,
})

// --- Exercises for the static gallery: each section isolates the notes its title promises ---

/** Bar of 1 beat: the beat's subdivision n fixes the duration (1→q, 2→8, 4→16, 8→32). */
const GALLERY_DURATIONS = parseExercise({
  id: 'gallery-durations',
  name: 'durations',
  timeSignature: [1, 4],
  steps: 'R | RL | RLRL | RLRLRLRL',
  repeats: 1,
})

/** n=3,5,6,7 are tuplets: 3-in-2, 5-in-4, 6-in-4, 7-in-4. */
const GALLERY_TUPLETS = parseExercise({
  id: 'gallery-tuplets',
  name: 'tuplets',
  timeSignature: [1, 4],
  steps: 'RLR | RLRLR | RLRLRL | RLRLRLR',
  repeats: 1,
})

/** One rest per duration (q, 8, 16, 32), plus one rest inside a beat in a triplet (3-in-2). */
const GALLERY_RESTS = parseExercise({
  id: 'gallery-rests',
  name: 'rests',
  timeSignature: [1, 4],
  steps: '- | -R | -RLR | -RLRLRLR | RL-',
  repeats: 1,
})

/** flam (1 grace note, slash), drag (2 beamed grace notes), buzz (glyph on the stem), tremolo (1 bar on the stem). */
const GALLERY_ORNAMENTS = parseExercise({
  id: 'gallery-ornaments',
  name: 'ornaments',
  timeSignature: [1, 4],
  steps: 'fR | dR | zR | tR',
  repeats: 1,
})

/** Accent and ornament on the same note: accented flam, accented buzz. */
const GALLERY_ACCENT_ORNAMENT = parseExercise({
  id: 'gallery-accent-ornament',
  name: 'accent + ornament',
  timeSignature: [1, 4],
  steps: '>fR | >zR',
  repeats: 1,
})

/** One bar in 4/4, 4 beats of eighths: one beam per beat must come out, not a single beam for the whole bar. */
const GALLERY_BEAMS = parseExercise({
  id: 'gallery-beams',
  name: 'beams per beat',
  timeSignature: [4, 4],
  steps: 'RL RL RL RL',
  repeats: 1,
})

/** Single paradiddle, 2 repeats: a real exercise, not a synthetic sampler of notes. */
const GALLERY_REALISTIC = parseExercise({
  id: 'gallery-realistic',
  name: 'realistic exercise',
  timeSignature: [4, 4],
  steps: '>RLRR >LRLL >RLRR >LRLL',
  repeats: 2,
})

const allNotes: StaveNote[] = []

/**
 * `barsPerRepeat` = all the exercise's bars: the gallery has no repeats to respect and wants the
 * max on a single row, and with `totalBars` equal the row never exceeds the piece.
 * `availW` is the container's width, with a generous fallback for when the page measures 0
 * (host not yet in layout).
 */
function optionsFor(host: HTMLDivElement, ex: Exercise, bars: number) {
  return {
    timeSignature: `${ex.timeSignature[0]}/${ex.timeSignature[1]}`,
    beatsPerBar: ex.timeSignature[0],
    barsPerRepeat: bars,
    totalBars: bars,
    availW: host.clientWidth || 1200,
  }
}

function draw(ex: typeof SHOWCASE): number {
  const host = document.getElementById('score') as HTMLDivElement
  allNotes.length = 0
  const bars = planExercise(ex)
  const t = performance.now()
  // The 40 bars now come out over several rows instead of in a strip: the measurement is the same,
  // it is the time to draw the whole SVG.
  const r: RenderedScore = renderScore(host, bars, optionsFor(host, ex, bars.length))
  r.notes.forEach((n) => {
    allNotes.push(n.note)
  })
  return performance.now() - t
}

/**
 * Static render of a gallery section: once, no measurement, no button.
 * The beat's width is no longer negotiable by the caller (`fitLayout` decides it from the
 * available space, and it never goes above natural): the sections with beats of 5-8 notes sit
 * narrower than before.
 */
function renderGallery(id: string, ex: Exercise): void {
  const host = document.getElementById(id) as HTMLDivElement
  const bars = planExercise(ex)
  renderScore(host, bars, optionsFor(host, ex, bars.length))
}

const COLORS = ['#2a2', '#c90', '#d33', '#888']

function paint(n: StaveNote, color: string): void {
  const el = n.getSVGElement()
  if (!el) {
    log('getSVGElement() empty: the ids are not in the DOM')
    return
  }
  paintColor(el, color)
}

function paintLoop(): void {
  if (allNotes.length === 0) {
    log('draw first')
    return
  }
  let i = 0
  let frames = 0
  let slow = 0
  const t0 = performance.now()
  let last = t0
  const timer = setInterval(() => {
    paint(allNotes[i % allNotes.length], COLORS[i % COLORS.length])
    i++
  }, 50)
  const raf = () => {
    const now = performance.now()
    frames++
    if (now - last > 32) slow++
    last = now
    if (now - t0 < 5000) requestAnimationFrame(raf)
    else {
      clearInterval(timer)
      log(`colour: ${i} notes in 5 s, ${frames} frames, ${slow} frames > 32 ms`)
    }
  }
  requestAnimationFrame(raf)
}

function scrollLoop(): void {
  const el = document.getElementById('score') as HTMLDivElement
  const width = el.querySelector('svg')?.getBoundingClientRect().width ?? 0
  const t0 = performance.now()
  let frames = 0
  let slow = 0
  let last = t0
  const raf = () => {
    const now = performance.now()
    const px = ((now - t0) / 1000) * 240
    el.style.transform = `translateX(${-px}px)`
    frames++
    if (now - last > 32) slow++
    last = now
    if (px < width) requestAnimationFrame(raf)
    else
      log(
        `scroll: ${width.toFixed(0)} px in ${((now - t0) / 1000).toFixed(1)} s, ${frames} frames, ${slow} frames > 32 ms`,
      )
  }
  requestAnimationFrame(raf)
}

function log(s: string): void {
  const pre = document.getElementById('log') as HTMLPreElement
  pre.textContent += `${s}\n`
}

// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('one')!.addEventListener('click', () => log(`1 bar: ${draw(SHOWCASE).toFixed(1)} ms`))
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('forty')!.addEventListener('click', () => {
  const ms = draw(PARADIDDLE)
  log(`40 bars: ${ms.toFixed(1)} ms, ${allNotes.length} notes`)
})
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('paint')!.addEventListener('click', paintLoop)
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('scroll')!.addEventListener('click', scrollLoop)

// The music font (Bravura) arrives async via @font-face: VexFlow measures glyphs in the DOM to
// compute the x coordinates, so a render before the font is applied uses the fallback and nails
// down wrong coordinates in the SVG (render.ts never re-lays-out). The buttons above are already
// safe because they fire after load; the gallery instead draws itself on startup, so it waits.
await notationFontsReady()

renderGallery('gallery-durations', GALLERY_DURATIONS)
renderGallery('gallery-tuplets', GALLERY_TUPLETS)
renderGallery('gallery-rests', GALLERY_RESTS)
renderGallery('gallery-ornaments', GALLERY_ORNAMENTS)
renderGallery('gallery-accent-ornament', GALLERY_ACCENT_ORNAMENT)
renderGallery('gallery-beams', GALLERY_BEAMS)
renderGallery('gallery-showcase', SHOWCASE)
renderGallery('gallery-realistic', GALLERY_REALISTIC)
