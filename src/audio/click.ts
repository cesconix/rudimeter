import type { MetronomeKind } from '../engine/grid'

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

/** Short sine with a short envelope, scheduled in the context clock. */
export function scheduleClick(ctx: AudioContext, time: number, opts: ClickOptions = {}): void {
  const { freq = 1000, gain = 0.5, dur = 0.005 } = opts
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(gain, time + 0.0005)
  g.gain.setValueAtTime(gain, time + dur)
  g.gain.linearRampToValueAtTime(0, time + dur + 0.003)
  osc.connect(g).connect(ctx.destination)
  osc.start(time)
  osc.stop(time + dur + 0.01)
}

/** Duration of the cached noise: longer than the longest stroke, so the envelope does not run out of material. */
const NOISE_SEC = 0.08
// One buffer per context, not one per stroke: at fast sixteenths that would be dozens of allocations
// per second inside the lookahead window, that is jitter exactly where precision is needed. `WeakMap` and not
// a variable: the context closes and reopens (microphone permission, iOS resume) and a buffer
// tied to the old context would not sound.
const noiseByCtx = new WeakMap<AudioContext, AudioBuffer>()

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseByCtx.get(ctx)
  if (cached) return cached
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(NOISE_SEC * ctx.sampleRate)), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseByCtx.set(ctx, buf)
  return buf
}

/**
 * Guide stroke: short noise through a bandpass, not a sine. The metronome is already
 * made of beeps, and two beeps at different frequencies under headphones, with the sticks in your hands, get
 * confused: the filtered noise reads as "stroke", the click as "time". The accent is
 * louder AND brighter — only louder, at practice volume, is not audible enough.
 */
export function scheduleGuide(ctx: AudioContext, time: number, accent: boolean): void {
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
  src.connect(band).connect(g).connect(ctx.destination)
  src.start(time)
  src.stop(time + decay + 0.01)
}
