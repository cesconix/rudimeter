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
import { BuzzRoll } from './buzz-roll'
import type { BarPlan, NotePlan } from './plan'

/** With `numLines: 1` the line drawn is line 0, i.e. f/5 on the percussion clef's key map. */
const KEY = 'f/5'

/**
 * Snare — and so pad — on the five-line staff: THIRD SPACE from the bottom, stem up. It is the
 * standard position of drum notation (PAS / Weinberg) and the one used on rudiment sheets. From
 * the bottom: e/4 line, f/4 space, g/4 line, a/4 space, b/4 middle line, then
 * c/5 — the third space.
 */
export const KEY_5_LINE = 'c/5'

export interface BuiltBar {
  notes: StaveNote[]
  beams: Beam[]
  tuplets: Tuplet[]
  /** slotIndex → note (rests are not there) */
  slotNotes: Map<number, StaveNote>
}

function buildNote(p: NotePlan, key: string = KEY): StaveNote {
  const n = new StaveNote({ keys: [key], duration: p.rest ? `${p.duration}r` : p.duration, stemDirection: Stem.UP })
  if (p.rest) return n
  if (p.sticking)
    n.addModifier(new Annotation(p.sticking).setVerticalJustification(AnnotationVerticalJustify.BOTTOM), 0)
  if (p.accent) n.addModifier(new Articulation('a>').setPosition(ModifierPosition.ABOVE), 0)
  if (p.grace.length > 0) {
    const flam = p.grace.length === 1
    const gs = p.grace.map(
      () => new GraceNote({ keys: [key], duration: flam ? '8' : '16', slash: flam, stemDirection: Stem.UP }),
    )
    const g = new GraceNoteGroup(gs, true)
    g.beamNotes()
    n.addModifier(g, 0)
  }
  if (p.ornament === 'tremolo') n.addModifier(new Tremolo(1), 0)
  if (p.ornament === 'buzz') n.addModifier(new BuzzRoll(), 0)
  return n
}

/** Notes, beams (one per beat, only on notes with a stem) and tuplets of a bar. */
export function buildBar(bar: BarPlan, key: string = KEY): BuiltBar {
  const notes: StaveNote[] = []
  const beams: Beam[] = []
  const tuplets: Tuplet[] = []
  const slotNotes = new Map<number, StaveNote>()
  for (const beat of bar.beats) {
    // `map(buildNote)` would pass the index as the second argument, i.e. as the key.
    const ns = beat.notes.map((n) => buildNote(n, key))
    ns.forEach((n, i) => {
      const si = beat.notes[i].slotIndex
      if (si !== null) slotNotes.set(si, n)
    })
    notes.push(...ns)
    const stemmed = ns.filter((n) => !n.isRest())
    if (stemmed.length > 1 && beat.notes[0].duration !== 'q') beams.push(new Beam(stemmed))
    // `ratioed: false`: VexFlow writes the ratio (`6:4`) instead of the plain number when the gap
    // between the two digits exceeds 1, so sextuplets came out as `6:4`. On rudiment sheets a
    // sextuplet is marked `6`.
    if (beat.tuplet) tuplets.push(new Tuplet(ns, { ...beat.tuplet, ratioed: false }))
  }
  return { notes, beams, tuplets, slotNotes }
}
