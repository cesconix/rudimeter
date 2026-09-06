export function createAudioContext(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) throw new Error('Web Audio non supportato da questo browser')
  return new Ctor()
}

/** Da chiamare dentro un gesto utente su iOS. */
export async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state !== 'running') await ctx.resume()
}
