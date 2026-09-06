export type Hand = 'R' | 'L'

/** Uno step dello sticking. hand null = pausa. */
export interface Step {
  hand: Hand | null
  accent: boolean
}

/** Valore di ogni step: ottavi, sedicesimi, terzine di ottavi. */
export type Subdivision = 8 | 16 | '8t'

export interface Exercise {
  id: string
  name: string
  source?: string
  timeSignature: [number, number]
  subdivision: Subdivision
  steps: Step[]
  repeats: number
}

/** Forma su file: steps come stringa "RLRL RLRL", `-` pausa, `>R` accento. */
export interface ExerciseJson {
  id: string
  name: string
  source?: string
  timeSignature: [number, number]
  subdivision: Subdivision
  steps: string
  repeats?: number
}

/** Colpo rilevato. t in secondi nel clock AudioContext, già corretto di latenza quando entra nel motore. */
export interface Hit {
  t: number
  peakDb: number
}

/** Uno slot atteso (solo step con mano). */
export interface Slot {
  index: number
  t: number
  step: Step
  repeat: number
  bar: number
  stepIndex: number
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
