// Spike: layout a capo su più righe con scorrimento verticale, da confrontare a mano con la
// striscia orizzontale del Task 11. Non è codice di produzione: `renderScore` resta com'è finché
// non c'è una decisione. Qui il layout viene rifatto a ogni cambio di larghezza o di zoom, che è
// esattamente la cosa che la striscia orizzontale non deve fare e questo layout invece deve.
import { BarlineType, Formatter, Renderer, RendererBackends, Stave } from 'vexflow/bravura'
import { EXERCISES } from '../data/exercises'
import { buildGrid } from '../engine/grid'
import { buildBar } from './build'
import { planExercise } from './plan'
import { notationFontsReady } from './render'

interface WrapOptions {
  beatPx: number
  beatsPerBar: number
  timeSignature: string
  /** larghezza disponibile: decide quante battute stanno su una riga */
  availWidth: number
  headPx: number
  systemH: number
}

interface WrapPoint {
  t: number
  x: number
  y: number
}

interface Wrapped {
  width: number
  height: number
  barsPerSystem: number
  systems: number
  /** slotIndex → posizione assoluta della testa nell'SVG */
  pos: Map<number, { x: number; y: number }>
}

/**
 * Come `renderScore`, ma manda a capo. Ogni riga riparte da x=0 e scende di `systemH`.
 * La chiave di percussione va ripetuta a ogni riga (è come si incide la musica vera), la stanghetta
 * finale solo sull'ultima battuta in assoluto.
 */
function renderWrapped(host: HTMLDivElement, bars: ReturnType<typeof planExercise>, o: WrapOptions): Wrapped {
  host.innerHTML = ''
  // La prima battuta di ogni riga paga la chiave: lo spazio utile della riga è ridotto di headPx.
  const avail = o.availWidth - o.headPx
  const barsPerSystem = Math.max(1, Math.floor(avail / (o.beatsPerBar * o.beatPx)))
  // Poi le battute si ALLARGANO per riempire la riga, come nella musica incisa: `beatPx` decide
  // quante ne stanno, non quanto sono larghe. Senza questo, a zoom alto una riga da 300px ne
  // ospiterebbe una da 192 e sprecherebbe il resto — e il layout sembrerebbe peggiore di quello che è.
  const barW = avail / barsPerSystem
  const systems = Math.ceil(bars.length / barsPerSystem)
  const width = o.availWidth
  const height = systems * o.systemH

  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  const pos = new Map<number, { x: number; y: number }>()

  bars.forEach((bar, i) => {
    const sys = Math.floor(i / barsPerSystem)
    const col = i % barsPerSystem
    const first = col === 0
    const x = first ? 0 : o.headPx + col * barW
    const y = sys * o.systemH
    const w = barW + (first ? o.headPx : 0)
    const stave = new Stave(x, y, w, { numLines: 1, spaceAboveStaffLn: 5, spaceBelowStaffLn: 4 })
    if (first) stave.addClef('percussion').addTimeSignature(o.timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    const built = buildBar(bar)
    Formatter.FormatAndDraw(ctx, stave, built.notes)
    built.beams.forEach((b) => b.setContext(ctx).draw())
    built.tuplets.forEach((t) => t.setContext(ctx).draw())
    built.slotNotes.forEach((note, slotIndex) => pos.set(slotIndex, { x: note.getAbsoluteX(), y: stave.getYForLine(0) }))
  })

  return { width, height, barsPerSystem, systems, pos }
}

/** Posizione del cursore a `now`. Interpola dentro la riga; fra una riga e l'altra salta. */
function cursorAt(points: WrapPoint[], now: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (now <= points[0].t) return points[0]
  const last = points[points.length - 1]
  if (now >= last.t) return last
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= now) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  // Solo dentro la stessa riga ha senso interpolare: a capo, il cursore resta su `a` fino a `b`.
  if (a.y !== b.y) return a
  return { x: a.x + ((b.x - a.x) * (now - a.t)) / (b.t - a.t), y: a.y }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement

async function main(): Promise<void> {
  await notationFontsReady()

  const viewport = $('viewport') as HTMLDivElement
  const host = $('host') as HTMLDivElement
  const cursor = $('cursor') as HTMLDivElement
  const info = $('info')
  const zoomEl = $('zoom') as HTMLInputElement
  const exEl = $('exercise') as HTMLSelectElement
  const bpmEl = $('bpm') as HTMLInputElement

  EXERCISES.forEach((e) => exEl.append(new Option(e.name, e.id)))
  exEl.value = EXERCISES[0].id

  let points: WrapPoint[] = []
  let systemH = 110
  let t0 = performance.now()

  function layout(): void {
    const ex = EXERCISES.find((e) => e.id === exEl.value) ?? EXERCISES[0]
    const beatPx = Number(zoomEl.value)
    systemH = Math.round(beatPx * 1.15)
    const bars = planExercise(ex)
    const w = renderWrapped(host, bars, {
      beatPx,
      beatsPerBar: ex.timeSignature[0],
      timeSignature: `${ex.timeSignature[0]}/${ex.timeSignature[1]}`,
      availWidth: viewport.clientWidth,
      headPx: Math.round(beatPx * 0.73),
      systemH,
    })

    // Tempi: la griglia vera dell'app, non un conteggio a mano — così le pause non sfasano gli
    // indici degli slot (`pos` è chiavato sullo slotIndex, e le pause non hanno slot).
    const bpm = Number(bpmEl.value)
    const grid = buildGrid(ex, bpm, 0, { countInBars: 0 })
    points = grid.slots.flatMap((s) => {
      const p = w.pos.get(s.index)
      return p ? [{ t: s.t, x: p.x, y: p.y }] : []
    })
    const slotsPerBar = Math.round(grid.slots.length / bars.length)
    t0 = performance.now()

    const visible = Math.max(1, Math.floor(viewport.clientHeight / systemH))
    info.textContent =
      `viewport ${viewport.clientWidth}×${viewport.clientHeight} · ${w.barsPerSystem} battute per riga · ` +
      `${w.systems} righe totali · ~${visible} righe visibili · ${w.barsPerSystem * visible} battute a vista · ` +
      `${slotsPerBar} note per battuta · SVG ${w.width}×${w.height}px`
  }

  let raf = 0
  function tick(): void {
    const now = (performance.now() - t0) / 1000
    const p = cursorAt(points, now)
    // La riga corrente sale verso il primo terzo dello schermo; il cursore si muove dentro la riga.
    const anchorY = Math.min(viewport.clientHeight / 3, systemH * 2)
    // La partitura scorre in verticale (transform: lavoro del compositore), il cursore si muove in
    // orizzontale dentro la riga corrente, che sta sempre all'altezza dell'ancora.
    host.style.transform = `translateY(${anchorY - p.y}px)`
    cursor.style.transform = `translateX(${p.x}px)`
    cursor.style.top = `${anchorY - systemH * 0.3}px`
    cursor.style.height = `${systemH * 0.6}px`
    if (points.length > 0 && now > points[points.length - 1].t + 1) t0 = performance.now()
    raf = requestAnimationFrame(tick)
  }

  layout()
  cancelAnimationFrame(raf)
  tick()

  // Rotazione, resize, zoom, cambio esercizio: tutti la stessa cosa — rifai il layout.
  let pending = 0
  const relayout = () => {
    clearTimeout(pending)
    pending = window.setTimeout(layout, 120)
  }
  window.addEventListener('resize', relayout)
  window.addEventListener('orientationchange', relayout)
  zoomEl.addEventListener('input', relayout)
  exEl.addEventListener('change', relayout)
  bpmEl.addEventListener('change', relayout)
}

void main()
