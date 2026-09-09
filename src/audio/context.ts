export function createAudioContext(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) throw new Error('Web Audio is not supported by this browser')
  return new Ctor()
}

/** To be called inside a user gesture on iOS. */
export async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state !== 'running') await ctx.resume()
}
