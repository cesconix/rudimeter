import { Capture, DEFAULT_THRESHOLDS } from './capture'
import { createAudioContext, ensureRunning } from './context'

export interface Engine {
  ctx: AudioContext
  capture: Capture
  /** Every sound goes here, never to `ctx.destination`: one bus the synthetic input can tap. */
  out: AudioNode
}

/** To be called inside a user gesture. Opens the context and the microphone. */
export async function createEngine(): Promise<Engine> {
  const ctx = createAudioContext()
  await ensureRunning(ctx)
  const out = ctx.createGain()
  out.connect(ctx.destination)
  const capture = new Capture(ctx, `${import.meta.env.BASE_URL}worklets/onset-processor.js`)
  try {
    await capture.start(DEFAULT_THRESHOLDS)
  } catch (err) {
    try {
      await ctx.close()
    } catch {
      // Ignore: a failure here must not mask the original error.
    }
    throw err
  }
  return { ctx, capture, out }
}

export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone denied. On iPad: Settings → Safari → Microphone → Allow, then reload.'
  }
  if (name === 'NotFoundError') return 'No microphone found.'
  const msg = (err as { message?: string })?.message
  return msg ? `Audio error: ${msg}` : 'Unknown audio error.'
}
