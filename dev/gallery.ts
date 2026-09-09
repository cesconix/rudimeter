// Pagina dev: galleria di tutte le figure che notation/plan + notation/build possono produrre
// (verifica visiva manuale, VexFlow disegna nel DOM) e controlli di misura (render di 40 battute,
// ricolorazione via DOM a 20 note/s, scroll con translateX) ereditati dallo spike originale.
//
// Il controllo "scroll" resta una misura di frame rate su un translateX orizzontale: la produzione
// non scorre più così (lo spartito va a capo e scorre in verticale via `scrollTop`, vedi Score), ma
// il numero che questo bottone produce — quanti frame saltano mentre un layer promosso si muove —
// vale lo stesso.

import type { StaveNote } from 'vexflow/bravura'
import { parseExercise } from '../src/engine/exercise'
import type { Exercise } from '../src/engine/types'
import { paintColor } from '../src/notation/paint'
import { planExercise } from '../src/notation/plan'
import { notationFontsReady, type RenderedScore, renderScore } from '../src/notation/render'

// --- Esercizi per i controlli di misura (bottoni "1 battuta" / "40 battute") ---

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

// --- Esercizi della galleria statica: ogni sezione isola le figure che il titolo promette ---

/** Battuta di 1 movimento: la suddivisione n del movimento fissa la durata (1→q, 2→8, 4→16, 8→32). */
const GALLERY_DURATIONS = parseExercise({
  id: 'gallery-durations',
  name: 'durate',
  timeSignature: [1, 4],
  steps: 'R | RL | RLRL | RLRLRLRL',
  repeats: 1,
})

/** n=3,5,6,7 sono gruppi irregolari: 3-in-2, 5-in-4, 6-in-4, 7-in-4. */
const GALLERY_TUPLETS = parseExercise({
  id: 'gallery-tuplets',
  name: 'gruppi irregolari',
  timeSignature: [1, 4],
  steps: 'RLR | RLRLR | RLRLRL | RLRLRLR',
  repeats: 1,
})

/** Una pausa per durata (q, 8, 16, 32), più una pausa dentro un movimento in terzina (3-in-2). */
const GALLERY_RESTS = parseExercise({
  id: 'gallery-rests',
  name: 'pause',
  timeSignature: [1, 4],
  steps: '- | -R | -RLR | -RLRLRLR | RL-',
  repeats: 1,
})

/** flam (1 acciaccatura, slash), drag (2 acciaccature travate), buzz (glifo sullo stelo), tremolo (1 barra sullo stelo). */
const GALLERY_ORNAMENTS = parseExercise({
  id: 'gallery-ornaments',
  name: 'ornamenti',
  timeSignature: [1, 4],
  steps: 'fR | dR | zR | tR',
  repeats: 1,
})

/** Accento e ornamento sulla stessa nota: flam accentato, buzz accentato. */
const GALLERY_ACCENT_ORNAMENT = parseExercise({
  id: 'gallery-accent-ornament',
  name: 'accento + ornamento',
  timeSignature: [1, 4],
  steps: '>fR | >zR',
  repeats: 1,
})

/** Una battuta in 4/4, 4 movimenti di ottavi: deve uscire una trave per movimento, non una sola trave per battuta. */
const GALLERY_BEAMS = parseExercise({
  id: 'gallery-beams',
  name: 'travi per movimento',
  timeSignature: [4, 4],
  steps: 'RL RL RL RL',
  repeats: 1,
})

/** Paradiddle singolo, 2 ripetizioni: un esercizio vero, non un campionario di figure sintetico. */
const GALLERY_REALISTIC = parseExercise({
  id: 'gallery-realistic',
  name: 'esercizio realistico',
  timeSignature: [4, 4],
  steps: '>RLRR >LRLL >RLRR >LRLL',
  repeats: 2,
})

const allNotes: StaveNote[] = []

/**
 * `barsPerRepeat` = tutte le battute dell'esercizio: la galleria non ha ripetizioni da rispettare e
 * vuole il massimo su una riga sola, e con `totalBars` uguale la riga non supera mai il pezzo.
 * `availW` è la larghezza del contenitore, con un fallback generoso per quando la pagina misura 0
 * (host non ancora in layout).
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
  // Le 40 battute ora escono su più righe invece che in striscia: la misura è la stessa, è il
  // tempo di disegnare tutto l'SVG.
  const r: RenderedScore = renderScore(host, bars, optionsFor(host, ex, bars.length))
  r.notes.forEach((n) => {
    allNotes.push(n.note)
  })
  return performance.now() - t
}

/**
 * Render statico di una sezione della galleria: una volta, nessuna misura, nessun bottone.
 * La larghezza del movimento non è più negoziabile dal chiamante (la decide `fitLayout` dallo
 * spazio, e non sale mai sopra il naturale): le sezioni con movimenti da 5-8 figure stanno più
 * strette di prima.
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
    log('getSVGElement() vuoto: gli id non sono nel DOM')
    return
  }
  paintColor(el, color)
}

function paintLoop(): void {
  if (allNotes.length === 0) {
    log('prima disegna')
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
      log(`colora: ${i} note in 5 s, ${frames} frame, ${slow} frame > 32 ms`)
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
        `scroll: ${width.toFixed(0)} px in ${((now - t0) / 1000).toFixed(1)} s, ${frames} frame, ${slow} frame > 32 ms`,
      )
  }
  requestAnimationFrame(raf)
}

function log(s: string): void {
  const pre = document.getElementById('log') as HTMLPreElement
  pre.textContent += `${s}\n`
}

// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('one')!.addEventListener('click', () => log(`1 battuta: ${draw(SHOWCASE).toFixed(1)} ms`))
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('forty')!.addEventListener('click', () => {
  const ms = draw(PARADIDDLE)
  log(`40 battute: ${ms.toFixed(1)} ms, ${allNotes.length} note`)
})
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('paint')!.addEventListener('click', paintLoop)
// biome-ignore lint/style/noNonNullAssertion: the id is hardcoded in gallery.html; a missing one must break the dev page loudly.
document.getElementById('scroll')!.addEventListener('click', scrollLoop)

// Il font musicale (Bravura) arriva async via @font-face: VexFlow misura i glifi nel DOM per
// calcolare le x, quindi un render prima che il font sia applicato usa il fallback e inchioda
// coordinate sbagliate nell'SVG (render.ts non fa mai re-layout). I bottoni sopra sono già al
// sicuro perché scattano dopo il load; la galleria invece disegna da sola all'avvio, quindi aspetta.
await notationFontsReady()

renderGallery('gallery-durations', GALLERY_DURATIONS)
renderGallery('gallery-tuplets', GALLERY_TUPLETS)
renderGallery('gallery-rests', GALLERY_RESTS)
renderGallery('gallery-ornaments', GALLERY_ORNAMENTS)
renderGallery('gallery-accent-ornament', GALLERY_ACCENT_ORNAMENT)
renderGallery('gallery-beams', GALLERY_BEAMS)
renderGallery('gallery-showcase', SHOWCASE)
renderGallery('gallery-realistic', GALLERY_REALISTIC)
