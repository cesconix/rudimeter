// Pagina dev: galleria di tutte le figure che notation/plan + notation/build possono produrre
// (verifica visiva manuale, VexFlow disegna nel DOM) e controlli di misura (render di 40 battute,
// ricolorazione via DOM a 20 note/s, scroll con translateX) ereditati dallo spike originale.
import { parseExercise } from '../engine/exercise'
import type { Exercise } from '../engine/types'
import { planExercise } from './plan'
import { notationFontsReady, renderScore, type RenderedScore } from './render'
import type { StaveNote } from 'vexflow/bravura'

// --- Esercizi per i controlli di misura (bottoni "1 battuta" / "40 battute") ---

const SHOWCASE = parseExercise({ id: 'showcase', name: 'showcase', timeSignature: [4, 4], steps: '>fRLRL dRLR zR- tRtL', repeats: 1 })
const PARADIDDLE = parseExercise({ id: 'para', name: 'para', timeSignature: [4, 4], steps: '>RLRR >LRLL >RLRR >LRLL', repeats: 40 })

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

function draw(ex: typeof SHOWCASE): number {
  const host = document.getElementById('score') as HTMLDivElement
  allNotes.length = 0
  const t = performance.now()
  const r: RenderedScore = renderScore(host, planExercise(ex), { timeSignature: `${ex.timeSignature[0]}/${ex.timeSignature[1]}`, beatsPerBar: ex.timeSignature[0] })
  r.notes.forEach((n) => allNotes.push(n.note))
  return performance.now() - t
}

/**
 * Render statico di una sezione della galleria: una volta, nessuna misura, nessun bottone.
 * `beatPx` è più largo del default (96) per le sezioni con movimenti da 5-8 figure: a 96px un
 * gruppo irregolare 6-in-4/7-in-4 o un movimento di ottavine si sovrappone e diventa illeggibile.
 */
function renderGallery(id: string, ex: Exercise, beatPx?: number): void {
  const host = document.getElementById(id) as HTMLDivElement
  renderScore(host, planExercise(ex), { beatPx, timeSignature: `${ex.timeSignature[0]}/${ex.timeSignature[1]}`, beatsPerBar: ex.timeSignature[0] })
}

const COLORS = ['#2a2', '#c90', '#d33', '#888']

function paint(n: StaveNote, color: string): void {
  const el = n.getSVGElement()
  if (!el) {
    log('getSVGElement() vuoto: gli id non sono nel DOM')
    return
  }
  el.querySelectorAll('path, text, rect').forEach((c) => {
    c.setAttribute('fill', color)
    const stroke = c.getAttribute('stroke')
    if (stroke && stroke !== 'none') c.setAttribute('stroke', color)
  })
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
    else log(`scroll: ${width.toFixed(0)} px in ${((now - t0) / 1000).toFixed(1)} s, ${frames} frame, ${slow} frame > 32 ms`)
  }
  requestAnimationFrame(raf)
}

function log(s: string): void {
  const pre = document.getElementById('log') as HTMLPreElement
  pre.textContent += `${s}\n`
}

document.getElementById('one')!.addEventListener('click', () => log(`1 battuta: ${draw(SHOWCASE).toFixed(1)} ms`))
document.getElementById('forty')!.addEventListener('click', () => {
  const ms = draw(PARADIDDLE)
  log(`40 battute: ${ms.toFixed(1)} ms, ${allNotes.length} note`)
})
document.getElementById('paint')!.addEventListener('click', paintLoop)
document.getElementById('scroll')!.addEventListener('click', scrollLoop)

// Il font musicale (Bravura) arriva async via @font-face: VexFlow misura i glifi nel DOM per
// calcolare le x, quindi un render prima che il font sia applicato usa il fallback e inchioda
// coordinate sbagliate nell'SVG (render.ts non fa mai re-layout). I bottoni sopra sono già al
// sicuro perché scattano dopo il load; la galleria invece disegna da sola all'avvio, quindi aspetta.
await notationFontsReady()

renderGallery('gallery-durations', GALLERY_DURATIONS, 220)
renderGallery('gallery-tuplets', GALLERY_TUPLETS, 220)
renderGallery('gallery-rests', GALLERY_RESTS, 220)
renderGallery('gallery-ornaments', GALLERY_ORNAMENTS)
renderGallery('gallery-accent-ornament', GALLERY_ACCENT_ORNAMENT)
renderGallery('gallery-beams', GALLERY_BEAMS)
renderGallery('gallery-showcase', SHOWCASE)
renderGallery('gallery-realistic', GALLERY_REALISTIC)
