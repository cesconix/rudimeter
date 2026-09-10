import { mulberry32 } from './rng'

/** Length of the cached stroke material: longer than the longest stroke, so the envelope never runs out. */
const STROKE_SEC = 0.08
/** Attack ramp: the same 0.5 ms as `scheduleClick`, so the detector fires with the same delay on a click and on a stroke and the calibration cancels it. */
const ATTACK_SEC = 0.0005
/** The peak is held this long after the attack: the sample the detector measures in its 5 ms hold is then exactly the peak. */
const HOLD_SEC = 0.0015
/** Exponential decay to −60 dB. */
const DECAY_SEC = 0.03
/** Any fixed value: the waveform must be the same on every page load. It is not part of the drummer's model, which draws from `rngFor(seed, …)`. */
const NOISE_SEED = 0x5eed

/**
 * The samples of a stroke before the envelope: 1 for the attack and the hold, seeded white noise
 * after. A raw noise burst never reaches its envelope's peak — measured in Chrome at −18 dBFS over
 * 60 bursts: −0.84 dB on average, −0.22 to −1.84 dB from one burst to the next — and `Math.random()`
 * noise differs on every load, so the same seed gave different dB columns and flipped the class of
 * strokes sitting on a judge boundary. With the plateau the measured peak is exactly `10^(peakDb/20)`
 * and the onset crossing is the same for every stroke of the same level; a fractional DelayNode
 * interpolates between two samples that are both 1, so the peak survives any sample rate.
 */
export function strokeSamples(sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.max(1, Math.ceil(STROKE_SEC * sampleRate)))
  const plateau = Math.min(out.length, Math.ceil((ATTACK_SEC + HOLD_SEC) * sampleRate))
  out.fill(1, 0, plateau)
  const rng = mulberry32(NOISE_SEED)
  for (let i = plateau; i < out.length; i++) out[i] = rng() * 2 - 1
  return out
}

// One buffer per context, like `noiseBuffer`: allocating per stroke inside the lookahead window is jitter.
const bufferByCtx = new WeakMap<BaseAudioContext, AudioBuffer>()

function strokeBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = bufferByCtx.get(ctx)
  if (cached) return cached
  const samples = strokeSamples(ctx.sampleRate)
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buf.copyToChannel(samples, 0)
  bufferByCtx.set(ctx, buf)
  return buf
}

/**
 * A practice-pad stroke as the onset detector sees it: a 0.5 ms attack, the peak held for 1.5 ms, then a
 * 30 ms exponential decay over seeded noise. `peakDb` is the peak amplitude in dBFS, and it is what the
 * detector reports back, to the last digit.
 */
export function scheduleStroke(dest: AudioNode, time: number, peakDb: number): void {
  const ctx = dest.context
  const src = ctx.createBufferSource()
  src.buffer = strokeBuffer(ctx)
  const g = ctx.createGain()
  const peak = 10 ** (peakDb / 20)
  const holdEnd = time + ATTACK_SEC + HOLD_SEC
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + ATTACK_SEC)
  g.gain.setValueAtTime(peak, holdEnd)
  // `exponentialRampToValueAtTime` cannot aim at zero: down to −60 dB, then the source is stopped.
  g.gain.exponentialRampToValueAtTime(peak * 0.001, holdEnd + DECAY_SEC)
  src.connect(g).connect(dest)
  src.start(time)
  src.stop(holdEnd + DECAY_SEC + 0.01)
}
