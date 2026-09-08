// Spike: spartito a capo con scorrimento verticale, da confrontare a mano con la striscia
// orizzontale del Task 11. Non è codice di produzione: `renderScore` resta com'è finché non c'è
// una decisione.
//
// Tre principi, in ordine di importanza:
//  1. il layout lo decide lo SPAZIO, non un controllo: dal viewport si ricavano battute per riga
//     e righe visibili, senza che l'utente configuri niente;
//  2. la riga resta un'unità MUSICALE: le battute per riga sono un multiplo (o un divisore) della
//     ripetizione, altrimenti un pattern di 2 battute su righe da 3 cade a cavallo ogni giro;
//  3. lo scorrimento è dell'utente, e il cursore lo governa solo finché l'utente non interviene.
import { BarlineType, Formatter, Renderer, RendererBackends, Stave } from 'vexflow/bravura'
import { EXERCISES } from '../data/exercises'
import { buildGrid } from '../engine/grid'
import { buildBar } from './build'
import { planExercise } from './plan'
import { notationFontsReady } from './render'

/** Geometria naturale: la musica si disegna sempre così, poi si scala tutta insieme. */
const NATURAL_BEAT_PX = 96
const NATURAL_HEAD_PX = 70
const NATURAL_SYSTEM_H = 110
/** Testa di nota alla scala naturale: serve per sapere quando lo zoom la rende illeggibile. */
const NATURAL_NOTEHEAD_PX = 11.8
/** Sotto questa dimensione la testa di nota non si legge più: è il vincolo che limita la densità. */
const MIN_NOTEHEAD_PX = 8

export type ScaleMode = 'fit' | 'natural'

interface Fit {
  barsPerRow: number
  scale: number
  systemH: number
  maxRows: number
}

/**
 * Dallo spazio disponibile ricava quante battute stanno su una riga e quante righe si vedono.
 * Nessun controllo manuale: se lo schermo è stretto, le battute per riga scendono da sole.
 *
 * Il vincolo non è la larghezza in sé ma la LEGGIBILITÀ: più battute per riga significa scala più
 * piccola, e sotto `MIN_NOTEHEAD_PX` la testa di nota diventa un puntino. Si prende quindi il
 * massimo che sta dentro quel limite, e lo si aggancia all'unità musicale.
 */
export function fitLayout(
  availW: number,
  availH: number,
  barsPerRepeat: number,
  beatsPerBar: number,
  mode: ScaleMode = 'fit',
): Fit {
  const naturalBar = beatsPerBar * NATURAL_BEAT_PX
  // 'fit' riempie la larghezza e accetta di rimpicciolire fino a MIN_NOTEHEAD_PX; 'natural' non
  // scala mai e accetta di lasciare spazio vuoto a destra. Sono le due facce dello stesso scambio:
  // quanta musica vedi contro quanto è grande.
  const minScale = mode === 'natural' ? 1 : MIN_NOTEHEAD_PX / NATURAL_NOTEHEAD_PX
  // k = availW / (n * naturalBar + head) ≥ minScale  ⇒  n ≤ (availW/minScale − head) / naturalBar
  const maxBars = Math.max(1, Math.floor((availW / minScale - NATURAL_HEAD_PX) / naturalBar))

  // Aggancio musicale: multipli della ripetizione finché ci stanno, altrimenti un suo divisore.
  let barsPerRow: number
  if (maxBars >= barsPerRepeat) {
    barsPerRow = Math.floor(maxBars / barsPerRepeat) * barsPerRepeat
  } else {
    const divisors = []
    for (let d = 1; d <= barsPerRepeat; d++) if (barsPerRepeat % d === 0) divisors.push(d)
    barsPerRow = divisors.filter((d) => d <= maxBars).pop() ?? 1
  }

  // In 'fit' la scala non sale mai sopra il naturale: su uno schermo largo la musica va gigante,
  // non è più leggibile, è solo grande.
  const scale = mode === 'natural' ? 1 : Math.min(1, availW / (barsPerRow * naturalBar + NATURAL_HEAD_PX))
  const systemH = NATURAL_SYSTEM_H * scale
  return { barsPerRow, scale, systemH, maxRows: Math.max(1, Math.floor(availH / systemH)) }
}

interface WrapPoint {
  t: number
  x: number
  /** indice della riga: il cursore interpola dentro la riga, non attraverso */
  row: number
}

interface Wrapped {
  width: number
  height: number
  systems: number
  pos: Map<number, { x: number; row: number }>
}

function renderWrapped(
  host: HTMLDivElement,
  bars: ReturnType<typeof planExercise>,
  fit: Fit,
  beatsPerBar: number,
  timeSignature: string,
): Wrapped {
  host.innerHTML = ''
  const naturalBar = beatsPerBar * NATURAL_BEAT_PX
  const systems = Math.ceil(bars.length / fit.barsPerRow)
  const width = fit.scale * (fit.barsPerRow * naturalBar + NATURAL_HEAD_PX)
  const height = systems * fit.systemH

  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  // Una sola scala su tutto il contesto: nota, spazio e altezza riga mantengono sempre lo stesso
  // rapporto. Allargare solo le battute cambierebbe le distanze ma non i glifi, che VexFlow disegna
  // a corpo fisso, e a righe fitte le teste finirebbero una sull'altra.
  ctx.scale(fit.scale, fit.scale)
  const pos = new Map<number, { x: number; row: number }>()

  bars.forEach((bar, i) => {
    const row = Math.floor(i / fit.barsPerRow)
    const col = i % fit.barsPerRow
    const first = col === 0
    const x = first ? 0 : NATURAL_HEAD_PX + col * naturalBar
    const w = naturalBar + (first ? NATURAL_HEAD_PX : 0)
    const stave = new Stave(x, row * NATURAL_SYSTEM_H, w, { numLines: 1, spaceAboveStaffLn: 5, spaceBelowStaffLn: 4 })
    if (first) stave.addClef('percussion').addTimeSignature(timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    const built = buildBar(bar)
    Formatter.FormatAndDraw(ctx, stave, built.notes)
    built.beams.forEach((b) => b.setContext(ctx).draw())
    built.tuplets.forEach((t) => t.setContext(ctx).draw())
    built.slotNotes.forEach((note, slotIndex) => pos.set(slotIndex, { x: note.getAbsoluteX() * fit.scale, row }))
  })

  return { width, height, systems, pos }
}

/**
 * Posizione del cursore a `now`, in pixel di schermo dentro la riga, più la riga corrente in forma
 * CONTINUA: `row` intero più la frazione percorsa. La frazione serve allo scorrimento, che così può
 * muoversi senza scatti anche mentre il cursore attraversa il capo riga.
 */
function cursorAt(points: WrapPoint[], now: number): { x: number; row: number } {
  if (points.length === 0) return { x: 0, row: 0 }
  if (now <= points[0].t) return { x: points[0].x, row: points[0].row }
  const last = points[points.length - 1]
  if (now >= last.t) return { x: last.x, row: last.row }
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= now) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  // Attraverso il capo riga la x non si interpola: tornerebbe indietro sullo schermo. Il cursore
  // resta sull'ultima nota della riga finché non inizia la successiva — è ciò che fa l'occhio.
  if (a.row !== b.row) return { x: a.x, row: a.row }
  return { x: a.x + (b.x - a.x) * ((now - a.t) / (b.t - a.t)), row: a.row }
}

/** Intervallo di tempo coperto da ogni riga: serve a sapere quanto si è avanzati DENTRO la riga. */
function rowSpansOf(points: WrapPoint[]): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  for (const p of points) {
    const s = spans[p.row]
    if (!s) spans[p.row] = { start: p.t, end: p.t }
    else s.end = p.t
  }
  // La riga dura fino all'inizio della successiva, non fino alla sua ultima nota: senza questo,
  // l'ultimo intervallo di ogni riga resterebbe scoperto e lo scorrimento ci si fermerebbe sopra.
  for (let r = 0; r < spans.length - 1; r++) {
    if (spans[r] && spans[r + 1]) spans[r].end = spans[r + 1].start
  }
  return spans
}

/**
 * Posizione continua della riga: intero più la frazione percorsa DENTRO la riga. È questo che guida
 * lo scorrimento. Interpolare fra due note adiacenti invece che sulla riga farebbe tornare la
 * frazione a zero a ogni nota, e lo scorrimento oscillerebbe avanti e indietro a ogni colpo.
 */
function rowExactAt(spans: { start: number; end: number }[], row: number, now: number): number {
  const s = spans[row]
  if (!s || s.end <= s.start) return row
  return row + Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start)))
}

const $ = (id: string) => document.getElementById(id) as HTMLElement

async function main(): Promise<void> {
  await notationFontsReady()

  const viewport = $('viewport') as HTMLDivElement
  const host = $('host') as HTMLDivElement
  const cursor = $('cursor') as HTMLDivElement
  const follow = $('follow') as HTMLButtonElement
  const info = $('info')
  const exEl = $('exercise') as HTMLSelectElement
  const bpmEl = $('bpm') as HTMLInputElement
  const modeEl = $('mode') as HTMLSelectElement

  EXERCISES.forEach((e) => exEl.append(new Option(e.name, e.id)))
  exEl.value = EXERCISES[0].id

  let points: WrapPoint[] = []
  let rowSpans: { start: number; end: number }[] = []
  let fit: Fit = { barsPerRow: 1, scale: 1, systemH: NATURAL_SYSTEM_H, maxRows: 1 }
  let t0 = performance.now()
  let following = true
  let scrollY = 0
  let lastFrame = performance.now()

  function layout(): void {
    const ex = EXERCISES.find((e) => e.id === exEl.value) ?? EXERCISES[0]
    const bars = planExercise(ex)
    const barsPerRepeat = Math.max(1, bars.filter((b) => b.repeat === 0).length)
    fit = fitLayout(viewport.clientWidth, viewport.clientHeight, barsPerRepeat, ex.timeSignature[0], modeEl.value as ScaleMode)
    const w = renderWrapped(host, bars, fit, ex.timeSignature[0], `${ex.timeSignature[0]}/${ex.timeSignature[1]}`)

    const grid = buildGrid(ex, Number(bpmEl.value), 0, { countInBars: 0 })
    points = grid.slots.flatMap((s) => {
      const p = w.pos.get(s.index)
      return p ? [{ t: s.t, x: p.x, row: p.row }] : []
    })
    rowSpans = rowSpansOf(points)
    t0 = performance.now()

    const slotsPerBar = Math.round(grid.slots.length / bars.length)
    info.textContent =
      `viewport ${viewport.clientWidth}×${viewport.clientHeight} · ${fit.barsPerRow} battute/riga ` +
      `(= ${(fit.barsPerRow / barsPerRepeat).toFixed(2).replace(/\.00$/, '')} ripetizioni, ${slotsPerBar * fit.barsPerRow} note) · ` +
      `${w.systems} righe · max ${fit.maxRows} a vista · zoom ${(fit.scale * 100).toFixed(0)}% · ` +
      `testa ${(NATURAL_NOTEHEAD_PX * fit.scale).toFixed(1)}px · riga ${fit.systemH.toFixed(0)}px`
  }

  function tick(): void {
    const nowMs = performance.now()
    const dt = Math.min(0.1, (nowMs - lastFrame) / 1000)
    lastFrame = nowMs
    const now = (nowMs - t0) / 1000
    const p = cursorAt(points, now)
    const rowExact = rowExactAt(rowSpans, p.row, now)

    // Il cursore sta sulla sua riga, sempre; è lo SCORRIMENTO che lo insegue.
    const target = Math.max(0, Math.min(Math.max(0, host.offsetHeight - viewport.clientHeight), rowExact * fit.systemH - viewport.clientHeight / 3))
    if (following) {
      // Smorzamento esponenziale, indipendente dal frame rate: raggiunge il bersaglio senza scatti
      // al cambio riga, e senza rincorrere ogni micro-variazione.
      scrollY += (target - scrollY) * (1 - Math.exp(-dt / 0.12))
      viewport.scrollTop = scrollY
    } else {
      scrollY = viewport.scrollTop
    }

    cursor.style.transform = `translateX(${p.x}px)`
    cursor.style.top = `${p.row * fit.systemH + fit.systemH * 0.2}px`
    cursor.style.height = `${fit.systemH * 0.6}px`

    // Il tasto c'è finché l'utente ha il controllo: se comparisse solo a cursore fuori schermo,
    // chi scorre di poco resterebbe in manuale senza avere il modo di tornare a seguire.
    follow.hidden = following

    if (points.length > 0 && now > points[points.length - 1].t + 1) t0 = performance.now()
    requestAnimationFrame(tick)
  }

  // Qualsiasi gesto di scorrimento dell'utente sospende l'inseguimento: comanda lui.
  const release = () => { following = false }
  viewport.addEventListener('wheel', release, { passive: true })
  viewport.addEventListener('touchstart', release, { passive: true })
  viewport.addEventListener('pointerdown', release)
  follow.addEventListener('click', () => { following = true; follow.hidden = true })

  let pending = 0
  const relayout = () => {
    clearTimeout(pending)
    pending = window.setTimeout(layout, 120)
  }
  window.addEventListener('resize', relayout)
  window.addEventListener('orientationchange', relayout)
  exEl.addEventListener('change', relayout)
  modeEl.addEventListener('change', relayout)
  bpmEl.addEventListener('change', relayout)

  layout()
  requestAnimationFrame(tick)
}

void main()
