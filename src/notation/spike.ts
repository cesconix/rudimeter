// Spike (pagina dev): VexFlow 5 su rigo a 1 linea. Verifica resa delle figure,
// tempo di render di 40 battute, ricolorazione via DOM a 20 note/s, scroll con translateX.
import {
  Annotation,
  AnnotationVerticalJustify,
  Articulation,
  Beam,
  Formatter,
  GraceNote,
  GraceNoteGroup,
  Metrics,
  Modifier,
  ModifierPosition,
  Renderer,
  RendererBackends,
  Stave,
  StaveNote,
  Stem,
  Tremolo,
  Tuplet,
} from 'vexflow/bravura'

const KEY = 'f/5' // con numLines: 1 la linea disegnata è la 0 = quella di f/5 in chiave di percussioni
const BEAT_PX = 96
const HEAD_PX = 70 // chiave + tempo nella prima battuta
const HEIGHT = 140

/** Buzz roll: VexFlow ha il glifo SMuFL (U+E22A) ma nessun modificatore che lo disegni. Stessa geometria di Tremolo. */
class BuzzRoll extends Modifier {
  static override get CATEGORY(): string {
    return 'Tremolo'
  }

  constructor() {
    super()
    this.position = ModifierPosition.CENTER
    this.text = '\ue22a' // SMuFL buzzRoll: VexFlow lo ha in Glyphs ma l'entry non lo esporta
  }

  override draw(): void {
    const ctx = this.checkContext()
    const note = this.checkAttachedNote()
    this.setRendered()
    const dir = note.getStemDirection()
    const scale = note.getFontScale()
    const x = note.getAbsoluteX() + (dir === Stem.UP ? note.getGlyphWidth() - Stem.WIDTH / 2 : Stem.WIDTH / 2)
    const y = note.getStemExtents().topY + Metrics.get('Tremolo.spacing') * dir * scale
    this.fontInfo.size = Metrics.get('Tremolo.fontSize') * scale
    this.renderText(ctx, x, y)
  }
}

interface Fig {
  dur: string
  rest?: boolean
  accent?: boolean
  sticking?: string
  grace?: 1 | 2
  tremolo?: boolean
  buzz?: boolean
}

function makeNote(f: Fig): StaveNote {
  const n = new StaveNote({ keys: [KEY], duration: f.rest ? `${f.dur}r` : f.dur, stemDirection: Stem.UP })
  if (f.rest) return n
  if (f.sticking) n.addModifier(new Annotation(f.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (f.accent) n.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  if (f.grace) {
    const flam = f.grace === 1
    const gs = Array.from({ length: f.grace }, () => new GraceNote({ keys: [KEY], duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }))
    const g = new GraceNoteGroup(gs, true)
    g.beamNotes()
    n.addModifier(g, 0)
  }
  if (f.tremolo) n.addModifier(new Tremolo(1), 0)
  if (f.buzz) n.addModifier(new BuzzRoll(), 0)
  return n
}

interface BarSpec {
  beats: Fig[][]
  tuplets?: { beat: number; num: number; occupied: number }[]
}

/** 4/4: >fR L R L | dR L R (terzina) | zR - | tR tL */
const SHOWCASE: BarSpec = {
  beats: [
    [{ dur: '16', accent: true, grace: 1, sticking: 'R' }, { dur: '16', sticking: 'L' }, { dur: '16', sticking: 'R' }, { dur: '16', sticking: 'L' }],
    [{ dur: '8', grace: 2, sticking: 'R' }, { dur: '8', sticking: 'L' }, { dur: '8', sticking: 'R' }],
    [{ dur: '8', buzz: true, sticking: 'R' }, { dur: '8', rest: true }],
    [{ dur: '8', tremolo: true, sticking: 'R' }, { dur: '8', tremolo: true, sticking: 'L' }],
  ],
  tuplets: [{ beat: 1, num: 3, occupied: 2 }],
}

const acc = (s: string): Fig => ({ dur: '16', accent: true, sticking: s })
const tap = (s: string): Fig => ({ dur: '16', sticking: s })
/** 4/4: >RLRR >LRLL >RLRR >LRLL */
const PARADIDDLE: BarSpec = {
  beats: [
    [acc('R'), tap('L'), tap('R'), tap('R')],
    [acc('L'), tap('R'), tap('L'), tap('L')],
    [acc('R'), tap('L'), tap('R'), tap('R')],
    [acc('L'), tap('R'), tap('L'), tap('L')],
  ],
}

const allNotes: StaveNote[] = []

function drawBars(specs: BarSpec[]): number {
  const host = document.getElementById('score') as HTMLDivElement
  host.innerHTML = ''
  allNotes.length = 0
  const widths = specs.map((s, i) => s.beats.length * BEAT_PX + (i === 0 ? HEAD_PX : 0))
  const total = widths.reduce((a, b) => a + b, 0)
  const renderer = new Renderer(host, RendererBackends.SVG)
  renderer.resize(total, HEIGHT)
  const ctx = renderer.getContext()
  const t = performance.now()
  let x = 0
  specs.forEach((spec, i) => {
    const stave = new Stave(x, 0, widths[i], { numLines: 1, spaceAboveStaffLn: 5, spaceBelowStaffLn: 4 })
    if (i === 0) stave.addClef('percussion').addTimeSignature(`${spec.beats.length}/4`)
    stave.setContext(ctx).draw()
    const notes: StaveNote[] = []
    const beams: Beam[] = []
    const tuplets: Tuplet[] = []
    spec.beats.forEach((beat, k) => {
      const ns = beat.map(makeNote)
      notes.push(...ns)
      const stemmed = ns.filter((n) => !n.isRest())
      if (stemmed.length > 1) beams.push(new Beam(stemmed))
      const tp = spec.tuplets?.find((q) => q.beat === k)
      if (tp) tuplets.push(new Tuplet(ns, { numNotes: tp.num, notesOccupied: tp.occupied }))
    })
    Formatter.FormatAndDraw(ctx, stave, notes)
    beams.forEach((b) => b.setContext(ctx).draw())
    tuplets.forEach((tp) => tp.setContext(ctx).draw())
    allNotes.push(...notes.filter((n) => !n.isRest()))
    x += widths[i]
  })
  return performance.now() - t
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

document.getElementById('one')!.addEventListener('click', () => log(`1 battuta: ${drawBars([SHOWCASE]).toFixed(1)} ms`))
document.getElementById('forty')!.addEventListener('click', () => {
  const ms = drawBars(Array.from({ length: 40 }, () => PARADIDDLE))
  log(`40 battute: ${ms.toFixed(1)} ms, ${allNotes.length} note`)
})
document.getElementById('paint')!.addEventListener('click', paintLoop)
document.getElementById('scroll')!.addEventListener('click', scrollLoop)
