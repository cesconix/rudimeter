import { PLAYER_PRESETS, type PlayerPreset } from './player'

export interface SynthConfig {
  seed: number
  preset: PlayerPreset
  /** simulated speaker → microphone delay, ms */
  latencyMs: number
  /** headphones on during the session: the speaker path is muted, only the drummer reaches the input */
  headphones: boolean
}

/** Plausible for a laptop; large enough that a wrong sign or a missing correction shows up as an `off`. */
export const SYNTH_LATENCY_MS = 35

/** `?synth=42[&player=steady|human|sloppy][&headphones=off]`. Null when `synth` is missing or not a small non-negative integer. */
export function parseSynthConfig(search: string): SynthConfig | null {
  const p = new URLSearchParams(search)
  const seed = p.get('synth')
  if (seed === null || !/^\d{1,9}$/.test(seed)) return null
  const player = p.get('player')
  // `Object.hasOwn`, not `in`: `in` also matches inherited keys like `toString`, which would hand
  // a function to `PLAYER_PRESETS[preset]` for `?player=toString`.
  const preset: PlayerPreset =
    player !== null && Object.hasOwn(PLAYER_PRESETS, player) ? (player as PlayerPreset) : 'human'
  return { seed: Number(seed), preset, latencyMs: SYNTH_LATENCY_MS, headphones: p.get('headphones') !== 'off' }
}
