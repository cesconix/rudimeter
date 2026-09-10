/** Duration of the cached noise: longer than the longest stroke, so the envelope does not run out of material. */
const NOISE_SEC = 0.08

// One buffer per context, not one per stroke: at fast sixteenths that would be dozens of allocations
// per second inside the lookahead window, that is jitter exactly where precision is needed. `WeakMap` and not
// a variable: the context closes and reopens (microphone permission, iOS resume) and a buffer
// tied to the old context would not sound.
const noiseByCtx = new WeakMap<BaseAudioContext, AudioBuffer>()

/** White noise for the guide sound; the synthetic strokes use their own seeded waveform, see `src/sim/stroke.ts`. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseByCtx.get(ctx)
  if (cached) return cached
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(NOISE_SEC * ctx.sampleRate)), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseByCtx.set(ctx, buf)
  return buf
}
