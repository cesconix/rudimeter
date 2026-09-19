/** Written note value: 1 = whole, 2 = half, 4 = quarter … 32 = thirty-second. */
export type NoteBase = 1 | 2 | 4 | 8 | 16 | 32
export type Dots = 0 | 1 | 2
export interface Duration {
  base: NoteBase
  dots?: Dots
}

/** [numerator, denominator]; the denominator is a power of two. */
export type Meter = [number, number]

export type InstrumentId =
  | 'kick'
  | 'hihat-pedal'
  | 'tom-floor-low'
  | 'tom-floor'
  | 'snare'
  | 'cross-stick'
  | 'tom-mid'
  | 'tom-high'
  | 'ride'
  | 'ride-bell'
  | 'hihat'
  | 'crash'

export type Notehead = 'normal' | 'x' | 'circle-x' | 'diamond' | 'triangle' | 'slash'

export interface Note {
  instrument: InstrumentId
  /** parenthesised notehead */
  ghost?: true
  /** "o" above the note (open hi-hat) */
  open?: true
  /** "+" above the note (closed hi-hat) */
  closed?: true
  /** tied to the same instrument in the next event of the same voice; that event must contain it */
  tie?: true
  /** overrides the catalogue's notehead */
  head?: Notehead
}

export type Hand = 'R' | 'L'

/** flam = 1 grace note, drag = 2; instrument defaults to the event's first note, hand to the opposite of `sticking` */
export interface Grace {
  kind: 'flam' | 'drag'
  instrument?: InstrumentId
  sticking?: Hand
}
export type Roll = { kind: 'tremolo'; slashes: 1 | 2 | 3 } | { kind: 'buzz' }
export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
/** a hairpin runs from the event that starts it to the event that stops it, in the same voice */
export type Hairpin = 'cresc' | 'dim' | 'stop'
/** MusicXML-style explicit beaming; absent on every event of a voice-bar = automatic beaming */
export type BeamMark = 'begin' | 'continue' | 'end'

export interface Event {
  duration: Duration
  rest?: true
  /** only with `rest`: takes its time, draws nothing */
  hidden?: true
  /** absent or empty only with `rest`; several notes = a chord */
  notes?: Note[]
  accent?: true
  sticking?: Hand
  grace?: Grace
  roll?: Roll
  dynamic?: Dynamic
  hairpin?: Hairpin
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

export interface Voice {
  stem: 'up' | 'down'
  items: Item[]
}
export interface PartBar {
  voices: Voice[]
}

export interface Tempo {
  bpm: number
  /** the beat the bpm counts; a quarter when absent */
  unit?: NoteBase
  dotted?: true
}

export interface Bar {
  /** required on bars[0]; inherited when absent; drawn only when it changes */
  meter?: Meter
  /** beaming groups in units of the meter's denominator, e.g. 7/8 → [2, 2, 3] */
  beams?: number[]
  /** applies from the start of this bar */
  tempo?: Tempo
  repeat?: { start?: true; end?: { times?: number } }
  /** the volta numbers this bar belongs to */
  ending?: number[]
  /** "%" — plays and draws the previous bar; `parts` must be absent */
  simile?: true
  /** honoured by the automatic layout only */
  newRow?: true
  parts?: Record<string, PartBar>
}

export interface Part {
  id: string
  kind: 'drumset'
}

/** `line` counts staff lines from the bottom: 0 is the first line, halves are spaces, 5 the first ledger line above, −0.5 the space below. */
export interface InstrumentSpec {
  line: number
  head: Notehead
  /** the voice the instrument belongs to by default: hands up, feet down */
  stem: 'up' | 'down'
  name: string
}

export interface Score {
  id: string
  title: string
  source?: string
  parts: Part[]
  /** per-piece overrides of the catalogue */
  instruments?: Partial<Record<InstrumentId, Partial<InstrumentSpec>>>
  bars: Bar[]
}
