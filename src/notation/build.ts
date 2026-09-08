import {
  Annotation,
  AnnotationVerticalJustify,
  Articulation,
  Beam,
  GraceNote,
  GraceNoteGroup,
  ModifierPosition,
  StaveNote,
  Stem,
  Tremolo,
  Tuplet,
} from 'vexflow/bravura'
import type { BarPlan, NotePlan } from './plan'
import { BuzzRoll } from './buzz-roll'

/** Con `numLines: 1` la linea disegnata è la 0, cioè quella di f/5 nella mappa della chiave di percussioni. */
export const KEY = 'f/5'

/**
 * Rullante — e quindi pad — sul rigo a cinque linee: TERZO SPAZIO dal basso, gambo in su. È la
 * posizione standard della notazione per batteria (PAS / Weinberg) ed è quella dei fogli dei
 * rudimenti. Dal basso: e/4 linea, f/4 spazio, g/4 linea, a/4 spazio, b/4 linea di mezzo, poi
 * c/5 — il terzo spazio.
 */
export const KEY_5_LINE = 'c/5'

export interface BuiltBar {
  notes: StaveNote[]
  beams: Beam[]
  tuplets: Tuplet[]
  /** slotIndex → nota (le pause non ci sono) */
  slotNotes: Map<number, StaveNote>
}

export function buildNote(p: NotePlan, key: string = KEY): StaveNote {
  const n = new StaveNote({ keys: [key], duration: p.rest ? `${p.duration}r` : p.duration, stemDirection: Stem.UP })
  if (p.rest) return n
  if (p.sticking) n.addModifier(new Annotation(p.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (p.accent) n.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  if (p.grace.length > 0) {
    const flam = p.grace.length === 1
    const gs = p.grace.map(() => new GraceNote({ keys: [key], duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }))
    const g = new GraceNoteGroup(gs, true)
    g.beamNotes()
    n.addModifier(g, 0)
  }
  if (p.ornament === 'tremolo') n.addModifier(new Tremolo(1), 0)
  if (p.ornament === 'buzz') n.addModifier(new BuzzRoll(), 0)
  return n
}

/** Note, travi (una per movimento, solo sulle figure con gambo) e gruppi irregolari di una battuta. */
export function buildBar(bar: BarPlan, key: string = KEY): BuiltBar {
  const notes: StaveNote[] = []
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []
  const slotNotes = new Map<number, StaveNote>()
  for (const beat of bar.beats) {
    // `map(buildNote)` passerebbe l'indice come secondo argomento, cioè come chiave.
    const ns = beat.notes.map((n) => buildNote(n, key))
    ns.forEach((n, i) => {
      const si = beat.notes[i].slotIndex
      if (si !== null) slotNotes.set(si, n)
    })
    notes.push(...ns)
    const stemmed = ns.filter((n) => !n.isRest())
    if (stemmed.length > 1 && beat.notes[0].duration !== 'q') beams.push(new Beam(stemmed))
    // `ratioed: false`: VexFlow scrive il rapporto (`6:4`) invece del solo numero quando lo scarto
    // fra le due cifre supera 1, quindi le sestine uscivano `6:4`. Sui fogli dei rudimenti sopra una
    // sestina c'è scritto `6`.
    if (beat.tuplet) tuplets.push(new Tuplet(ns, { ...beat.tuplet, ratioed: false }))
  }
  return { notes, beams, tuplets, slotNotes }
}
