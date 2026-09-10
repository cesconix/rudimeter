import type { SynthConfig } from './config'

export interface SynthGraph {
  /** what the worklet listens to instead of the microphone */
  input: AudioNode
  /** where the drummer plays: through the same delay as the speaker path */
  strokes: AudioNode
  /** headphones on = the speaker no longer reaches the input */
  setHeadphones(on: boolean): void
}

/** A synthetic run: the flag that started it and the graph it plays into. */
export interface SynthRun {
  config: SynthConfig
  graph: SynthGraph
}

/**
 * The air between speaker and microphone, as a DelayNode. `out` (everything the app plays) and the
 * drummer's strokes both cross it: the calibration measures the delay on the clicks and the session
 * takes it away from the strokes, exactly what happens with a real speaker and a real microphone.
 * `loopback` is the headphones: at 0 the app's own sound no longer comes back in.
 */
export function createSynthGraph(ctx: AudioContext, out: AudioNode, config: SynthConfig): SynthGraph {
  const delay = ctx.createDelay(1)
  delay.delayTime.value = config.latencyMs / 1000
  const loopback = ctx.createGain()
  const input = ctx.createGain()
  out.connect(loopback)
  loopback.connect(delay)
  delay.connect(input)
  return {
    input,
    strokes: delay,
    setHeadphones(on) {
      loopback.gain.value = on ? 0 : 1
    },
  }
}
