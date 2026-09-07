import { Capture, DEFAULT_THRESHOLDS } from './capture'
import { createAudioContext, ensureRunning } from './context'

export interface Engine {
  ctx: AudioContext
  capture: Capture
}

/** Da chiamare dentro un gesto utente. Apre contesto e microfono. */
export async function createEngine(): Promise<Engine> {
  const ctx = createAudioContext()
  await ensureRunning(ctx)
  const capture = new Capture(ctx, `${import.meta.env.BASE_URL}worklets/onset-processor.js`)
  await capture.start(DEFAULT_THRESHOLDS)
  return { ctx, capture }
}

export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microfono negato. Su iPad: Impostazioni → Safari → Microfono → Consenti, poi ricarica.'
  }
  if (name === 'NotFoundError') return 'Nessun microfono trovato.'
  const msg = (err as { message?: string })?.message
  return msg ? `Errore audio: ${msg}` : 'Errore audio sconosciuto.'
}
