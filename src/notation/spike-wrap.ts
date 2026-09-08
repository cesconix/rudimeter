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

/**
 * Geometria naturale: la musica si disegna sempre così, poi si scala. Cambiare questi numeri cambia
 * le PROPORZIONI (quanto è alta una riga rispetto alle note); la scala la decide la larghezza.
 */
const NATURAL_BEAT_PX = 96
const NATURAL_HEAD_PX = 70
const NATURAL_SYSTEM_H = 110

interface WrapOptions {
  beatsPerBar: number
  timeSignature: string
  /** battute per riga: unità MUSICALE (un numero intero di ripetizioni), non derivata dal viewport */
  barsPerSystem: number
  /** larghezza disponibile: decide la SCALA della riga, non quanta musica ci sta */
  availWidth: number
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
  /** fattore di zoom applicato all'intero contesto */
  scale: number
  /** altezza di una riga in pixel di schermo (già scalata) */
  systemH: number
  /** slotIndex → posizione assoluta della testa nell'SVG, in pixel di schermo */
  pos: Map<number, { x: number; y: number }>
}

/**
 * Come `renderScore`, ma manda a capo. Ogni riga riparte da x=0 e scende di `systemH`.
 * La chiave di percussione va ripetuta a ogni riga (è come si incide la musica vera), la stanghetta
 * finale solo sull'ultima battuta in assoluto.
 */
function renderWrapped(host: HTMLDivElement, bars: ReturnType<typeof planExercise>, o: WrapOptions): Wrapped {
  host.innerHTML = ''
  // Il viewport NON decide il layout, decide solo la scala. La riga è un'unità MUSICALE — un numero
  // intero di ripetizioni — così ogni riga contiene la stessa musica e il pattern non straddia le
  // righe in modo diverso a ogni giro, che su materiale ripetitivo è illeggibile.
  //
  // La musica viene disegnata SEMPRE alle stesse coordinate naturali, poi l'intero contesto viene
  // scalato di `k`. È la differenza fra zoomare e stirare: allargando solo le battute, le distanze
  // cambierebbero ma i glifi no (VexFlow li disegna a un corpo fisso), e a righe fitte le teste di
  // nota finirebbero una sull'altra. Con `ctx.scale` il rapporto fra nota, spazio e altezza della
  // riga non cambia mai — su nessun dispositivo e a nessuno zoom.
  const barsPerSystem = o.barsPerSystem
  const naturalBarW = o.beatsPerBar * NATURAL_BEAT_PX
  const naturalRowW = barsPerSystem * naturalBarW + NATURAL_HEAD_PX
  const k = o.availWidth / naturalRowW
  const systems = Math.ceil(bars.length / barsPerSystem)
  const width = o.availWidth
  const height = systems * NATURAL_SYSTEM_H * k

  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  ctx.scale(k, k)
  const pos = new Map<number, { x: number; y: number }>()

  bars.forEach((bar, i) => {
    const sys = Math.floor(i / barsPerSystem)
    const col = i % barsPerSystem
    const first = col === 0
    const x = first ? 0 : NATURAL_HEAD_PX + col * naturalBarW
    const y = sys * NATURAL_SYSTEM_H
    const w = naturalBarW + (first ? NATURAL_HEAD_PX : 0)
    const stave = new Stave(x, y, w, { numLines: 1, spaceAboveStaffLn: 5, spaceBelowStaffLn: 4 })
    if (first) stave.addClef('percussion').addTimeSignature(o.timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    const built = buildBar(bar)
    Formatter.FormatAndDraw(ctx, stave, built.notes)
    built.beams.forEach((b) => b.setContext(ctx).draw())
    built.tuplets.forEach((t) => t.setContext(ctx).draw())
    // Le posizioni tornano in coordinate naturali: il cursore vive nello spazio dello schermo,
    // quindi vanno riportate moltiplicando per la stessa scala applicata al contesto.
    built.slotNotes.forEach((note, slotIndex) => pos.set(slotIndex, { x: note.getAbsoluteX() * k, y: stave.getYForLine(0) * k }))
  })

  return { width, height, barsPerSystem, systems, pos, scale: k, systemH: NATURAL_SYSTEM_H * k }
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
    const bars = planExercise(ex)
    // La riga è un numero intero di RIPETIZIONI. Lo "zoom" sceglie quante: meno ripetizioni per
    // riga = note più grandi, perché la riga occupa comunque tutta la larghezza.
    const barsPerRepeat = Math.max(1, bars.filter((b) => b.repeat === 0).length)
    const repeatsPerRow = Number(zoomEl.value)
    const barsPerSystem = barsPerRepeat * repeatsPerRow

    const w = renderWrapped(host, bars, {
      beatsPerBar: ex.timeSignature[0],
      timeSignature: `${ex.timeSignature[0]}/${ex.timeSignature[1]}`,
      barsPerSystem,
      availWidth: viewport.clientWidth,
    })
    systemH = w.systemH

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

    // Quante righe si vedano è una CONSEGUENZA, non un parametro: la partitura ha un'altezza sua
    // e il viewport è solo una finestra che ci scorre sopra.
    const visible = viewport.clientHeight / systemH
    // La testa di nota è ~11,8px alla scala naturale: scalata dice quanto è grande davvero.
    const headPx = 11.8 * w.scale
    info.textContent =
      `viewport ${viewport.clientWidth}×${viewport.clientHeight} · riga = ${repeatsPerRow} rip. ` +
      `(${w.barsPerSystem} battute, ${slotsPerBar * w.barsPerSystem} note) · ${w.systems} righe · ` +
      `${visible.toFixed(1)} a vista = ${(visible * repeatsPerRow).toFixed(0)} ripetizioni · ` +
      `zoom ${(w.scale * 100).toFixed(0)}% · testa ${headPx.toFixed(1)}px · riga ${systemH.toFixed(0)}px`
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
  zoomEl.addEventListener("change", relayout)
  exEl.addEventListener('change', relayout)
  bpmEl.addEventListener('change', relayout)
}

void main()
