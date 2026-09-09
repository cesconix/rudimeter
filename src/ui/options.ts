import { DEFAULT_METRONOME, type MetronomeOptions } from '../engine/grid'
import type { AutoIncrement } from '../engine/progression'

/** Everything the picker decides besides the exercise and the bpm. */
export interface SessionOptions {
  metronome: MetronomeOptions
  autoIncrement: AutoIncrement | null
}

export const DEFAULT_SESSION_OPTIONS: SessionOptions = { metronome: DEFAULT_METRONOME, autoIncrement: null }
