import { describe, expect, it } from 'bun:test'
import { audibleTime } from './clock'

/** AudioContext ridotto ai due membri che `audibleTime` guarda. */
function fakeCtx(currentTime: number, contextTime?: number | null): AudioContext {
  const ctx: Record<string, unknown> = { currentTime }
  if (contextTime !== null) ctx.getOutputTimestamp = () => ({ contextTime, performanceTime: 0 })
  return ctx as unknown as AudioContext
}

describe('audibleTime', () => {
  it('ritorna la posizione di uscita, non il clock di schedulazione', () => {
    // 16,6 ms di latenza di uscita: è la misura reale sul Mac di sviluppo.
    expect(audibleTime(fakeCtx(10, 9.9834))).toBeCloseTo(9.9834, 6)
  })

  it('resta indietro rispetto a currentTime: è questo il punto della funzione', () => {
    const ctx = fakeCtx(10, 9.9834)
    expect(audibleTime(ctx)).toBeLessThan(ctx.currentTime)
  })

  it('ripiega su currentTime se il browser non espone getOutputTimestamp', () => {
    expect(audibleTime(fakeCtx(10, null))).toBe(10)
  })

  it('ripiega su currentTime finché il device non ha reso il primo blocco (contextTime 0)', () => {
    // Zero non è "inizio partitura": è "non lo so ancora". Prenderlo alla lettera farebbe
    // saltare il cursore all'inizio del pezzo nei primi frame.
    expect(audibleTime(fakeCtx(0.5, 0))).toBe(0.5)
  })

  it('ripiega su currentTime se contextTime non è un numero', () => {
    expect(audibleTime(fakeCtx(3, undefined))).toBe(3)
  })
})
