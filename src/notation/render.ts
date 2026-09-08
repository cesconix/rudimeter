import { BarlineType, type Beam, Formatter, Renderer, RendererBackends, Stave, type StaveNote, type Tuplet } from 'vexflow/bravura'
import { KEY_5_LINE, buildBar } from './build'
import type { BarPlan } from './plan'

/** Geometria naturale: la musica si disegna sempre così, poi si scala tutta insieme. */
const NATURAL_BEAT_PX = 96
const NATURAL_HEAD_PX = 70
const NATURAL_SYSTEM_H = 110
/**
 * Rigo a cinque linee. VexFlow tiene 10px fra una linea e l'altra, quindi il rigo è alto 40px;
 * sopra restano 40px per gambi, travi, accenti e parentesi di terzina, sotto 30px per le
 * diteggiature R/L. Somma 110: la banda della riga resta quella di prima e tutte le misure dello
 * scorrimento (multipli di 110) valgono ancora.
 *
 * `NATURAL_STAFF_TOP` e `NATURAL_STAFF_H` sono esportate perché il cursore non vive nell'SVG (è un
 * div fratello, vedi `Score`): per coprire il rigo e non l'intera banda della riga deve sapere dove
 * il rigo comincia e quanto è alto.
 */
const STAFF_LINES = 5
export const NATURAL_STAFF_TOP = 40
export const NATURAL_STAFF_H = (STAFF_LINES - 1) * 10
/** Testa di nota alla scala naturale: serve per sapere quando lo zoom la rende illeggibile. */
export const NATURAL_NOTEHEAD_PX = 11.8
/** Sotto questa dimensione la testa di nota non si legge più: è il vincolo che limita la densità. */
export const MIN_NOTEHEAD_PX = 8
/**
 * Margine a destra dell'ultima battuta della riga. Senza, la stanghetta di fine battuta cade a
 * `x = larghezza` — cioè esattamente sul bordo dell'SVG — e viene tagliata: sulla riga si vede solo
 * la stanghetta di mezzo e la riga sembra finire nel nulla. Otto pixel bastano anche alla barra
 * finale, che è spessa.
 */
const NATURAL_RIGHT_PAD = 8

export interface RenderOptions {
  /** es. "2/4" */
  timeSignature: string
  beatsPerBar: number
  /** battute di UNA ripetizione: la riga si aggancia a questa unità musicale */
  barsPerRepeat: number
  /** larghezza utile in px: da qui si ricavano battute per riga e scala */
  availW: number
}

export interface Fit {
  barsPerRow: number
  scale: number
  systemH: number
}

export interface RenderedNote {
  note: StaveNote
  /** x della testa in px di schermo (già moltiplicata per `scale`) */
  x: number
  /** indice della riga su cui sta la nota */
  row: number
}

export interface RenderedScore {
  width: number
  height: number
  rows: number
  fit: Fit
  /** slotIndex → nota, x di schermo e riga */
  notes: Map<number, RenderedNote>
  /**
   * Travi e gruppi irregolari di tutte le battute, nell'ordine di disegno. Il colore vive sulla
   * nota (`notes`), non qui: questi due array esistono solo perché la colorazione via
   * `getSVGElement()` non raggiunge il gruppo SVG di `Beam`/`Tuplet` (è un fratello, non un figlio,
   * di quello della nota) — un task futuro che avesse bisogno di intervenire su travi o
   * parentesi ha già l'oggetto a disposizione, senza dover rifare il giro di `buildBar`.
   */
  beams: Beam[]
  tuplets: Tuplet[]
}

/**
 * Risolve quando i font sono pronti nel documento (incluso il font musicale Bravura di VexFlow).
 * Non tiene un riferimento al `FontFaceSet` di `document.fonts`: la promise risolta a `void` basta
 * al chiamante, che deve solo sapere *quando*, non *cosa*.
 */
export function notationFontsReady(): Promise<void> {
  return document.fonts.ready.then(() => undefined)
}

/**
 * Dallo spazio disponibile ricava quante battute stanno su una riga e con quale scala.
 * Nessun controllo manuale: se lo schermo è stretto, le battute per riga scendono da sole.
 *
 * Il vincolo non è la larghezza in sé ma la LEGGIBILITÀ: più battute per riga significa scala più
 * piccola, e sotto `MIN_NOTEHEAD_PX` la testa di nota diventa un puntino. Si prende quindi il
 * massimo che sta dentro quel limite, e lo si aggancia all'unità musicale.
 */
export function fitLayout(availW: number, barsPerRepeat: number, beatsPerBar: number): Fit {
  const naturalBar = beatsPerBar * NATURAL_BEAT_PX
  // Si riempie la larghezza accettando di rimpicciolire fino a MIN_NOTEHEAD_PX: è lo scambio fra
  // quanta musica vedi e quanto è grande, e il limite di leggibilità lo chiude.
  const minScale = MIN_NOTEHEAD_PX / NATURAL_NOTEHEAD_PX
  // k = availW / (n * naturalBar + head + pad) ≥ minScale  ⇒  n ≤ (availW/minScale − head − pad) / naturalBar
  const fixed = NATURAL_HEAD_PX + NATURAL_RIGHT_PAD
  const maxBars = Math.max(1, Math.floor((availW / minScale - fixed) / naturalBar))

  // Aggancio musicale: multipli della ripetizione finché ci stanno, altrimenti un suo divisore.
  let barsPerRow: number
  if (maxBars >= barsPerRepeat) {
    barsPerRow = Math.floor(maxBars / barsPerRepeat) * barsPerRepeat
  } else {
    const divisors = []
    for (let d = 1; d <= barsPerRepeat; d++) if (barsPerRepeat % d === 0) divisors.push(d)
    barsPerRow = divisors.filter((d) => d <= maxBars).pop() ?? 1
  }

  // La scala non sale mai sopra il naturale: su uno schermo largo la musica va gigante, non è più
  // leggibile, è solo grande.
  const scale = Math.min(1, availW / (barsPerRow * naturalBar + fixed))
  return { barsPerRow, scale, systemH: NATURAL_SYSTEM_H * scale }
}

/**
 * Disegna le battute in un unico SVG dentro `host` (svuotato prima), andando a capo ogni
 * `fit.barsPerRow` battute. Il colore si applica poi al DOM (notation/paint) e lo scorrimento è
 * `scrollTop` sul viewport: nessuno dei due passa di qui.
 *
 * Si ri-disegna solo quando cambia lo spazio (o l'esercizio): il layout è calcolato una volta e
 * inciso nell'SVG, quindi chi chiama deve ridisegnare quando `availW` cambia.
 *
 * Non chiamare prima che `notationFontsReady()` sia risolta: VexFlow misura la larghezza dei glifi
 * leggendo il DOM, quindi un render fatto prima che il font musicale sia applicato calcola coordinate
 * x sbagliate che poi restano incise nell'SVG per sempre, perché questa funzione non fa re-layout.
 */
export function renderScore(host: HTMLDivElement, bars: BarPlan[], opts: RenderOptions): RenderedScore {
  const fit = fitLayout(opts.availW, opts.barsPerRepeat, opts.beatsPerBar)
  host.innerHTML = ''
  const naturalBar = opts.beatsPerBar * NATURAL_BEAT_PX
  const rows = Math.ceil(bars.length / fit.barsPerRow)
  const width = fit.scale * (fit.barsPerRow * naturalBar + NATURAL_HEAD_PX + NATURAL_RIGHT_PAD)
  const height = rows * fit.systemH

  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  // Una sola scala su tutto il contesto: nota, spazio e altezza riga mantengono sempre lo stesso
  // rapporto. Allargare solo le battute cambierebbe le distanze ma non i glifi, che VexFlow disegna
  // a corpo fisso, e a righe fitte le teste finirebbero una sull'altra.
  ctx.scale(fit.scale, fit.scale)
  const notes = new Map<number, RenderedNote>()
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []

  bars.forEach((bar, i) => {
    const row = Math.floor(i / fit.barsPerRow)
    const col = i % fit.barsPerRow
    const first = col === 0
    const x = first ? 0 : NATURAL_HEAD_PX + col * naturalBar
    const w = naturalBar + (first ? NATURAL_HEAD_PX : 0)
    const stave = new Stave(x, row * NATURAL_SYSTEM_H, w, { numLines: STAFF_LINES, spaceAboveStaffLn: 4, spaceBelowStaffLn: 3 })
    if (first) stave.addClef('percussion')
    // Il tempo si scrive una volta sola, a inizio pezzo: ripeterlo a ogni riga è rumore, e in
    // 2/4 su riga stretta è rumore che costa un ottavo della larghezza utile.
    if (row === 0 && col === 0) stave.addTimeSignature(opts.timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    // Numero di battuta solo a inizio riga: con 20 ripetizioni identiche è l'unico riferimento che
    // dice DOVE sei nel pezzo. Sopra il rigo, non a sinistra: a sinistra ci sono chiave e tempo.
    if (first) {
      ctx.save()
      ctx.setFont('system-ui, sans-serif', 13)
      ctx.setFillStyle('#888')
      ctx.fillText(String(i + 1), 0, stave.getYForLine(0) - 8)
      ctx.restore()
    }
    const built = buildBar(bar, KEY_5_LINE)
    Formatter.FormatAndDraw(ctx, stave, built.notes)
    built.beams.forEach((b) => b.setContext(ctx).draw())
    built.tuplets.forEach((t) => t.setContext(ctx).draw())
    built.slotNotes.forEach((note, slotIndex) => notes.set(slotIndex, { note, x: note.getAbsoluteX() * fit.scale, row }))
    beams.push(...built.beams)
    tuplets.push(...built.tuplets)
  })

  return { width, height, rows, fit, notes, beams, tuplets }
}
