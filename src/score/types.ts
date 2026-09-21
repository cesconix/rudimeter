/** Written note value: 1 = whole, 2 = half, 4 = quarter … 32 = thirty-second. */
export type NoteBase = 1 | 2 | 4 | 8 | 16 | 32
export type Dots = 0 | 1 | 2
export interface Duration {
  base: NoteBase
  dots?: Dots
}

/** [numerator, denominator]; the denominator is a power of two. */
export type Meter = [number, number]

export type Hand = 'R' | 'L'

/** flam = 1 grace note, drag = 2; drawn on the snare's line, stem up, before the main note */
export interface Grace {
  kind: 'flam' | 'drag'
}
export type Roll = { kind: 'tremolo'; slashes: 1 | 2 | 3 } | { kind: 'buzz' }
/** MusicXML-style explicit beaming; absent on every event of a bar = automatic beaming */
export type BeamMark = 'begin' | 'continue' | 'end'

/** A stroke on the snare, or a rest. */
export interface Event {
  duration: Duration
  /** takes its time, draws the rest of its value; a rest carries no accent, sticking, grace, roll or tie */
  rest?: true
  accent?: true
  sticking?: Hand
  grace?: Grace
  roll?: Roll
  /** tied to the next event of the piece in written order (across the barline), which must be a stroke */
  tie?: true
  /** printed above the staff, at the event's x */
  text?: string
  beam?: BeamMark
}

export interface TupletGroup {
  tuplet: { actual: number; normal: number }
  items: Event[]
}
export type Item = Event | TupletGroup
export const isTuplet = (item: Item): item is TupletGroup => 'tuplet' in item

export interface Bar {
  /** required on bars[0]; inherited when absent; drawn only when it changes */
  meter?: Meter
  /** beaming groups in units of the meter's denominator, e.g. 7/8 → [2, 2, 3] */
  beams?: number[]
  repeat?: { start?: true; end?: { times?: number } }
  /** honoured by the automatic layout only */
  newRow?: true
  items: Item[]
}

export interface Score {
  id: string
  title: string
  source?: string
  bars: Bar[]
}
