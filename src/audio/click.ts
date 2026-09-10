import type { MetronomeKind } from '../engine/grid'
import { noiseBuffer } from './noise'

export interface ClickOptions {
  freq?: number
  gain?: number
  dur?: number
}

/** First beat of the bar higher and louder; subdivisions lower and softer. */
export function clickOptionsFor(kind: MetronomeKind): ClickOptions {
  if (kind === 'bar') return { freq: 1500, gain: 0.6 }
  if (kind === 'sub') return { freq: 800, gain: 0.25 }
  return { freq: 1000, gain: 0.5 }
}

/** Short sine with a short envelope, scheduled in the clock of the context `dest` belongs to. */
export function scheduleClick(dest: AudioNode, time: number, opts: ClickOptions = {}): void {
  const { freq = 1000, gain = 0.5, dur = 0.005 } = opts
  const ctx = dest.context
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(gain, time + 0.0005)
  g.gain.setValueAtTime(gain, time + dur)
  g.gain.linearRampToValueAtTime(0, time + dur + 0.003)
  osc.connect(g).connect(dest)
  osc.start(time)
  osc.stop(time + dur + 0.01)
}

/**
 * Guide stroke: short noise through a bandpass, not a sine. The metronome is already
 * made of beeps, and two beeps at different frequencies under headphones, with the sticks in your hands, get
 * confused: the filtered noise reads as "stroke", the click as "time". The accent is
 * louder AND brighter — only louder, at practice volume, is not audible enough.
 */
export function scheduleGuide(dest: AudioNode, time: number, accent: boolean): void {
  const ctx = dest.context
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = accent ? 2600 : 1900
  band.Q.value = 1.2
  const g = ctx.createGain()
  const peak = accent ? 0.5 : 0.24
  const decay = accent ? 0.05 : 0.035
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + 0.001)
  // Exponential and not linear: the tail dying out is what makes a "stroke" instead of a "tick". It cannot
  // aim at zero — `exponentialRampToValueAtTime` with 0 is an error — so it goes down to an
  // inaudible value and the source is stopped right after.
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
  src.connect(band).connect(g).connect(dest)
  src.start(time)
  src.stop(time + decay + 0.01)
}
