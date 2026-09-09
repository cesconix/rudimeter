import { describe, expect, it } from 'bun:test'
import { audibleTime } from './clock'

/** AudioContext reduced to the two members `audibleTime` looks at. */
function fakeCtx(currentTime: number, contextTime?: number | null): AudioContext {
  const ctx: Record<string, unknown> = { currentTime }
  if (contextTime !== null) ctx.getOutputTimestamp = () => ({ contextTime, performanceTime: 0 })
  return ctx as unknown as AudioContext
}

describe('audibleTime', () => {
  it('returns the output position, not the scheduling clock', () => {
    // 16.6 ms of output latency: it is the real measurement on the development Mac.
    expect(audibleTime(fakeCtx(10, 9.9834))).toBeCloseTo(9.9834, 6)
  })

  it('lags behind currentTime: that is the very point of the function', () => {
    const ctx = fakeCtx(10, 9.9834)
    expect(audibleTime(ctx)).toBeLessThan(ctx.currentTime)
  })

  it('falls back to currentTime if the browser does not expose getOutputTimestamp', () => {
    expect(audibleTime(fakeCtx(10, null))).toBe(10)
  })

  it('falls back to currentTime until the device has rendered the first block (contextTime 0)', () => {
    // Zero is not "start of the score": it is "I do not know yet". Taking it literally would make
    // the cursor jump to the start of the piece in the first frames.
    expect(audibleTime(fakeCtx(0.5, 0))).toBe(0.5)
  })

  it('falls back to currentTime if contextTime is not a number', () => {
    expect(audibleTime(fakeCtx(3, undefined))).toBe(3)
  })
})
