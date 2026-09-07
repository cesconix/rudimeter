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

export interface BuiltBar {
  notes: StaveNote[]
  beams: Beam[]
  tuplets: Tuplet[]
  /** slotIndex → nota (le pause non ci sono) */
  slotNotes: Map<number, StaveNote>
}

export function buildNote(p: NotePlan): StaveNote {
  const n = new StaveNote({ keys: [KEY], duration: p.rest ? `${p.duration}r` : p.duration, stemDirection: Stem.UP })
  if (p.rest) return n
  if (p.sticking) n.addModifier(new Annotation(p.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (p.accent) n.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  if (p.grace.length > 0) {
    const flam = p.grace.length === 1
    const gs = p.grace.map(() => new GraceNote({ keys: [KEY], duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }))
    const g = new GraceNoteGroup(gs, true)
    g.beamNotes()
    n.addModifier(g, 0)
  }
  if (p.ornament === 'tremolo') n.addModifier(new Tremolo(1), 0)
  if (p.ornament === 'buzz') n.addModifier(new BuzzRoll(), 0)
  return n
}

/** Note, travi (una per movimento, solo sulle figure con gambo) e gruppi irregolari di una battuta. */
export function buildBar(bar: BarPlan): BuiltBar {
  const notes: StaveNote[] = []
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []
  const slotNotes = new Map<number, StaveNote>()
  for (const beat of bar.beats) {
    const ns = beat.notes.map(buildNote)
    ns.forEach((n, i) => {
      const si = beat.notes[i].slotIndex
      if (si !== null) slotNotes.set(si, n)
    })
    notes.push(...ns)
    const stemmed = ns.filter((n) => !n.isRest())
    if (stemmed.length > 1 && beat.notes[0].duration !== 'q') beams.push(new Beam(stemmed))
    if (beat.tuplet) tuplets.push(new Tuplet(ns, beat.tuplet))
  }
  return { notes, beams, tuplets, slotNotes }
}
