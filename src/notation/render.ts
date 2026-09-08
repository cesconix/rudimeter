import { BarlineType, type Beam, Formatter, Renderer, RendererBackends, Stave, type StaveNote, type Tuplet } from 'vexflow/bravura'
import { buildBar } from './build'
import type { BarPlan } from './plan'

export interface RenderOptions {
  /** larghezza di un movimento */
  beatPx?: number
  /** spazio per chiave e tempo nella prima battuta */
  headPx?: number
  height?: number
  /** es. "2/4" */
  timeSignature: string
  beatsPerBar: number
}

export interface RenderedNote {
  note: StaveNote
  /** x assoluta della testa nel SVG */
  x: number
}

export interface RenderedScore {
  width: number
  height: number
  /** y della linea del rigo */
  lineY: number
  /** slotIndex → nota e x */
  notes: Map<number, RenderedNote>
  /** x di inizio di ogni battuta */
  barX: number[]
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
 * Disegna le battute in un unico SVG dentro `host` (svuotato prima). Nessun re-render dopo:
 * il colore si applica al DOM (notation/paint), lo scorrimento è un transform sul contenitore.
 *
 * Non chiamare prima che `notationFontsReady()` sia risolta: VexFlow misura la larghezza dei glifi
 * leggendo il DOM, quindi un render fatto prima che il font musicale sia applicato calcola coordinate
 * x sbagliate che poi restano incise nell'SVG per sempre, perché questa funzione non fa re-layout.
 */
export function renderScore(host: HTMLDivElement, bars: BarPlan[], opts: RenderOptions): RenderedScore {
  const beatPx = opts.beatPx ?? 96
  const headPx = opts.headPx ?? 70
  const height = opts.height ?? 140
  host.innerHTML = ''
  const barW = opts.beatsPerBar * beatPx
  const width = bars.length * barW + headPx
  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()
  const notes = new Map<number, RenderedNote>()
  const barX: number[] = []
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []
  let x = 0
  let lineY = 0
  bars.forEach((bar, i) => {
    const w = barW + (i === 0 ? headPx : 0)
    const stave = new Stave(x, 0, w, { numLines: 1, spaceAboveStaffLn: 5, spaceBelowStaffLn: 4 })
    if (i === 0) stave.addClef('percussion').addTimeSignature(opts.timeSignature)
    if (i === bars.length - 1) stave.setEndBarType(BarlineType.END)
    stave.setContext(ctx).draw()
    lineY = stave.getYForLine(0)
    const built = buildBar(bar)
    Formatter.FormatAndDraw(ctx, stave, built.notes)
    built.beams.forEach((b) => b.setContext(ctx).draw())
    built.tuplets.forEach((t) => t.setContext(ctx).draw())
    built.slotNotes.forEach((note, slotIndex) => notes.set(slotIndex, { note, x: note.getAbsoluteX() }))
    beams.push(...built.beams)
    tuplets.push(...built.tuplets)
    barX.push(x)
    x += w
  })
  return { width, height, lineY, notes, barX, beams, tuplets }
}
