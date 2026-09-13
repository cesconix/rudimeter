import { describe, expect, it } from 'bun:test'
import { parseFeedbackBody } from './feedback'

describe('parseFeedbackBody', () => {
  it('accepts a session of the device with a trimmed comment within the cap, rejects the rest', () => {
    expect(parseFeedbackBody({ sessionId: 'iphone@2026-09-12T06:22:57.210Z', text: '  late  ' }, 'iphone')).toEqual({
      ok: true,
      sessionId: 'iphone@2026-09-12T06:22:57.210Z',
      text: 'late',
    })
    expect(parseFeedbackBody({ sessionId: 'mac@2026-09-12T06:22:57.210Z', text: 'late' }, 'iphone')).toMatchObject({
      ok: false,
      error: expect.stringContaining('sessionId must be'),
    })
    expect(parseFeedbackBody({ text: 'late' }, 'iphone')).toMatchObject({ ok: false })
    expect(parseFeedbackBody({ sessionId: 'iphone@2026-09-12T06:22:57.210Z', text: '   ' }, 'iphone')).toMatchObject({
      ok: false,
      error: expect.stringContaining('1 to 2000'),
    })
    expect(
      parseFeedbackBody({ sessionId: 'iphone@2026-09-12T06:22:57.210Z', text: 'x'.repeat(2001) }, 'iphone'),
    ).toMatchObject({ ok: false })
    expect(parseFeedbackBody(null, 'iphone')).toMatchObject({ ok: false })
  })
  it('rejects a sessionId whose tail is not a valid date', () => {
    expect(parseFeedbackBody({ sessionId: 'iphone@x', text: 'late' }, 'iphone')).toMatchObject({
      ok: false,
      error: expect.stringContaining('sessionId must be'),
    })
  })
})
