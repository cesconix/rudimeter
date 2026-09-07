export type Hand = 'R' | 'L'

/** flam = 1 acciaccatura, drag = 2, buzz = rullo non misurato, tremolo = rullo misurato (una barra = doppi) */
export type Ornament = 'flam' | 'drag' | 'buzz' | 'tremolo'

/** Uno step dello sticking. hand null = pausa. */
export interface Step {
  hand: Hand | null
  accent: boolean
  ornament?: Ornament
  /** mano delle acciaccature (solo flam/drag); default: opposta a `hand` */
  graceHand?: Hand
}

/** Un movimento: gli step lo dividono in parti uguali (steps.length = suddivisione, 1-8). */
export interface Beat {
  steps: Step[]
}

export interface Bar {
  beats: Beat[]
}

export interface Exercise {
  id: string
  name: string
  source?: string
  timeSignature: [number, number]
  /** la stringa DSL originale: si mostra nel picker e si riesporta */
  sticking: string
  bars: Bar[]
  repeats: number
}

/** Forma su file. `steps` è la DSL v2: spazio = movimento, `|` = battuta, prefissi `>` `f` `d` `z` `t`, `-` pausa. */
export interface ExerciseJson {
  id: string
  name: string
  source?: string
  timeSignature: [number, number]
  steps: string
  repeats?: number
}

/** Colpo rilevato. t in secondi nel clock AudioContext, già corretto di latenza quando entra nel motore. */
export interface Hit {
  t: number
  peakDb: number
}

/** Uno slot atteso (solo step con mano). `dur` = durata dello step in secondi; la finestra di assegnazione è dur/2. */
export interface Slot {
  index: number
  t: number
  dur: number
  step: Step
  repeat: number
  bar: number
  beat: number
  sub: number
}

export type Grade = 'good' | 'ok' | 'off' | 'miss' | 'pending'

export interface Judged {
  slot: Slot
  hit: Hit | null
  offsetMs: number | null
  grade: Grade
}

export interface Windows {
  goodMs: number
  okMs: number
}

export const DEFAULT_WINDOWS: Windows = { goodMs: 20, okMs: 40 }

export interface JudgeResult {
  judged: Judged[]
  extras: Hit[]
}
