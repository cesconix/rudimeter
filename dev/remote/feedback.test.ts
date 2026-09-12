import { describe, expect, it } from 'bun:test'
import type { LogLine } from './analysis'
import { collectFeedback, parseFeedbackBody } from './feedback'

const at = (s: number): string => new Date(Date.UTC(2026, 8, 12, 6, 0, 0, Math.round(s * 1000))).toISOString()
const line = (event: string, s: number, fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ event, at: at(s), seq: 0, ...fields } satisfies LogLine)
const slots = [
  { i: 0, t: 1, dur: 0.5, hand: 'R', accent: false, repeat: 0, bar: 0, beat: 0, sub: 0 },
  { i: 1, t: 1.5, dur: 0.5, hand: 'L', accent: false, repeat: 0, bar: 0, beat: 1, sub: 0 },
]
const stats = {
  slots: 2,
  good: 2,
  ok: 0,
  off: 0,
  miss: 0,
  pending: 0,
  extras: 0,
  meanOffsetMs: 0,
  sdOffsetMs: 0,
  hands: [],
  blocks: [],
  absorbed: 0,
  uniformity: {},
  accents: {},
  bpmByRepeat: [],
  guide: false,
}
const session = (s: number, id: string): string[] => [
  line('session:start', s, { exerciseId: id, bpm: 60, latencyMs: 73, slope: 1, slots, clicks: [] }),
  line('session:done', s + 3, { exerciseId: id, bpm: 60, stats, markdown: '' }),
]
const deps = { exerciseById: () => undefined }

describe('collectFeedback', () => {
  it('lists every comment newest first with its session, across devices, strays with no session', () => {
    const iphone = [
      ...session(2, 'stone-1'),
      line('session:feedback', 6, { text: 'left hand late', source: 'app' }),
      line('session:feedback', 30, { sessionId: 'iphone@nope', text: 'lost', source: 'dashboard' }),
    ].join('\n')
    const mac = [
      ...session(10, 'stone-2'),
      line('session:feedback', 20, { sessionId: `mac@${at(10)}`, text: 'echo, in hindsight', source: 'dashboard' }),
    ].join('\n')
    const entries = collectFeedback(
      [
        { device: 'iphone', text: iphone },
        { device: 'mac', text: mac },
      ],
      deps,
    )
    expect(entries.map((e) => e.text)).toEqual(['lost', 'echo, in hindsight', 'left hand late'])
    expect(entries.map((e) => e.device)).toEqual(['iphone', 'mac', 'iphone'])
    expect(entries[0].session).toBeNull()
    expect(entries[1].session?.exerciseId).toBe('stone-2')
    expect(entries[1].source).toBe('dashboard')
    expect(entries[2].session?.id).toBe(`iphone@${at(2)}`)
  })
  it('is empty for logs without a comment', () => {
    expect(collectFeedback([{ device: 'x', text: session(1, 'stone-1').join('\n') }], deps)).toEqual([])
  })
})

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
