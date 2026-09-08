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
  /** battute dell'intero pezzo: la riga non è mai più lunga della musica che c'è */
  totalBars: number
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
  /** x del BORDO SINISTRO della testa in px di schermo (già moltiplicata per `scale`) */
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
 * La regola, in una riga: **riempi la larghezza, a meno che una riga più corta la riempia già a meno
 * del 10% di scarto — in quel caso tieni le note grandi.**
 *
 * `MIN_NOTEHEAD_PX` è un PAVIMENTO, non un obiettivo: impaccare fino al limite di leggibilità
 * spende tutto il budget ogni volta, e quasi sempre esiste una riga più corta che copre la stessa
 * larghezza con teste molto più grandi. A 847px di viewport, 6 battute in 2/4 scendono a 8.1px di
 * testa mentre 4 ne occupano 846 su 847 — cioè riempiono lo schermo — al corpo pieno di 11.8px.
 */
export function fitLayout(availW: number, barsPerRepeat: number, beatsPerBar: number, totalBars: number): Fit {
  // `barsPerRepeat` a 0 (esercizio degenere, campo non popolato) darebbe `n % 0` e divisioni per
  // zero: NaN che arriva silenzioso fino a `renderer.resize(NaN, NaN)` e a Stave con y NaN, cioè un
  // riquadro bianco senza una riga in console. Meglio una riga sbagliata che nessun disegno.
  const atLeastOneBar = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1)
  const repeat = atLeastOneBar(barsPerRepeat)
  const total = atLeastOneBar(totalBars)
  // Stessa porta, terzo parametro: un `availW` non finito uscirebbe come scala e altezza NaN anche
  // con gli altri due sani. Oggi arriva sempre da `clientWidth`, che è un numero; la guardia sta qui
  // perché la funzione è esportata, non perché il chiamante di oggi ne abbia bisogno.
  const width = Number.isFinite(availW) ? Math.max(0, availW) : 0
  const naturalBar = beatsPerBar * NATURAL_BEAT_PX
  const fixed = NATURAL_HEAD_PX + NATURAL_RIGHT_PAD
  /** Larghezza che `n` battute occupano al corpo naturale, chiave e margine destro inclusi. */
  const naturalW = (n: number) => n * naturalBar + fixed

  // Candidati: solo righe che restano un'unità MUSICALE — i divisori della ripetizione (mezza
  // ripetizione per riga, un quarto…) e i suoi multipli (una per riga, due, tre…). Troncati al
  // pezzo: una riga più lunga della musica lascerebbe rigo vuoto a destra e, peggio, ridurrebbe la
  // scala per fare spazio a battute che non esistono.
  //
  // Limite noto e accettato: con `barsPerRepeat` primo e > 2 (7, 11) sotto la ripetizione c'è solo
  // il candidato 1, quindi su schermo stretto si scende a una battuta per riga anche dove ne
  // starebbero 3. La libreria non produce quel caso (gli esercizi hanno 1 o 2 battute per
  // ripetizione) e spezzare il pattern a metà giro costerebbe al lettore più di quanto renda.
  const candidates: number[] = []
  for (let d = 1; d <= repeat && d <= total; d++) if (repeat % d === 0) candidates.push(d)
  for (let m = 2 * repeat; m <= total; m += repeat) candidates.push(m)

  // `naturalW` è crescente in n e i candidati sono ordinati: il più grande che ci sta e il più
  // piccolo che sfora si trovano in una passata.
  let nFit = 0
  let nOver = 0
  for (const n of candidates) {
    if (naturalW(n) <= width) nFit = n
    else if (nOver === 0) nOver = n
  }

  // Prima la riga che riempie già al corpo pieno (scarto sotto il 10%), poi quella che riempie
  // rimpicciolendo ma resta leggibile, poi comunque quella al corpo pieno anche se lascia spazio.
  let barsPerRow: number
  if (nFit !== 0 && width - naturalW(nFit) <= 0.1 * width) barsPerRow = nFit
  else if (nOver !== 0 && NATURAL_NOTEHEAD_PX * (width / naturalW(nOver)) >= MIN_NOTEHEAD_PX) barsPerRow = nOver
  else if (nFit !== 0) barsPerRow = nFit
  // Nemmeno una battuta ci sta al minimo leggibile: si mostra comunque la riga più corta possibile,
  // rimpicciolita oltre il pavimento. Una battuta illeggibile è meglio di zero battute.
  else barsPerRow = candidates[0]

  // La scala non sale mai sopra il naturale: su uno schermo largo la musica andrebbe gigante, non è
  // più leggibile, è solo grande.
  const scale = Math.min(1, width / naturalW(barsPerRow))
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
  const fit = fitLayout(opts.availW, opts.barsPerRepeat, opts.beatsPerBar, opts.totalBars)
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
    // `getNoteHeadBeginX`, non `getAbsoluteX`: quest'ultima è l'ancora della nota nel formatter e
    // cade ~7px a destra del bordo sinistro della testa — irrilevante per una stanghetta da 2px,
    // visibile per la banda del cursore, che è larga quanto la testa e ci deve stare sopra esatta.
    built.slotNotes.forEach((note, slotIndex) => notes.set(slotIndex, { note, x: note.getNoteHeadBeginX() * fit.scale, row }))
    beams.push(...built.beams)
    tuplets.push(...built.tuplets)
  })

  return { width, height, rows, fit, notes, beams, tuplets }
}
