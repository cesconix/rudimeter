export type Hand = 'R' | 'L'

/** flam = 1 grace note, drag = 2, buzz = unmeasured roll, tremolo = measured roll (one slash = doubles) */
export type Ornament = 'flam' | 'drag' | 'buzz' | 'tremolo'

/** One sticking step. hand null = rest. */
export interface Step {
  hand: Hand | null
  accent: boolean
  ornament?: Ornament
  /** grace note hand (flam/drag only); default: opposite of `hand` */
  graceHand?: Hand
}

/** One beat: the steps split it into equal parts (steps.length = subdivision, 1-8). */
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
  /** the original DSL string: shown in the picker and re-exported */
  sticking: string
  bars: Bar[]
  repeats: number
}

/** On-file shape. `steps` is DSL v2: space = beat, `|` = bar, prefixes `>` `f` `d` `z` `t`, `-` rest. */
export interface ExerciseJson {
  id: string
  name: string
  source?: string
  timeSignature: [number, number]
  steps: string
  repeats?: number
}

/** Detected hit. t in seconds on the AudioContext clock, already latency-corrected when it enters the engine. */
export interface Hit {
  t: number
  peakDb: number
}

/** One expected slot (steps with a hand only). `dur` = step duration in seconds; the assignment window is dur/2. */
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
  /** extras recognized as grace notes or roll bounces: they do not count as an error */
  absorbed: Hit[]
}
