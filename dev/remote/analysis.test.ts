import { describe, expect, it } from 'bun:test'
import {
  analyzeCalibrations,
  analyzeSession,
  errorBudget,
  type LoggedClick,
  type LoggedSlot,
  type LogLine,
  parseLines,
  splitSessions,
} from './analysis'

const at = (s: number): string => new Date(Date.UTC(2026, 8, 12, 6, 0, 0, Math.round(s * 1000))).toISOString()
const line = (event: string, s: number, fields: Record<string, unknown> = {}): LogLine => ({
  event,
  at: at(s),
  seq: 0,
  ...fields,
})
const slots = (n: number, t0 = 1, dur = 0.5): LoggedSlot[] =>
  Array.from({ length: n }, (_, i) => ({
    i,
    t: t0 + i * dur,
    dur,
    hand: i % 2 ? 'L' : 'R',
    accent: false,
    ornament: null,
    repeat: 0,
    bar: 0,
    beat: i,
    sub: 0,
  }))
const clicks = (n: number, t0 = 1, dur = 0.5): LoggedClick[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i * dur, kind: 'beat', silent: false }))
const stats = (o: Partial<Record<'good' | 'ok' | 'off' | 'miss' | 'extras', number>>) => ({
  slots: 4,
  good: 0,
  ok: 0,
  off: 0,
  miss: 0,
  pending: 0,
  extras: 0,
  meanOffsetMs: null,
  sdOffsetMs: null,
  hands: [],
  blocks: [],
  absorbed: 0,
  uniformity: {},
  accents: {},
  bpmByRepeat: [],
  guide: false,
  ...o,
})
const engine = (s: number, extra: Record<string, unknown> = {}) =>
  line('engine', s, {
    deviceLabel: 'mic',
    sampleRate: 48000,
    baseLatencyMs: 2.67,
    outputLatencyMs: 12.6,
    floorDb: -40,
    synth: null,
    settings: {},
    ...extra,
  })
const calibrated = (s: number, latencyMs: number, offsets: number[]) => [
  line('calibration:measured', s, { latencyMs, offsetsMs: offsets, fit: { slope: 1, r2: 0.999, n: 12 } }),
  line('calibration:done', s + 0.001, { latencyMs, slope: 1, deviceLabel: 'mic', savedAt: at(s) }),
]
const deps = { exerciseById: () => undefined }

describe('parseLines / splitSessions', () => {
  it('splits sessions, keeps context, tolerates a torn tail and the StrictMode ghost start', () => {
    const text = [
      ...[engine(0), ...calibrated(1, 73, [73, 73, 73, 73, 73, 73, 73, 73])].map((l) => JSON.stringify(l)),
      JSON.stringify(
        line('session:start', 2, {
          exerciseId: 'x',
          bpm: 60,
          latencyMs: 73,
          slope: 1,
          slots: slots(2),
          clicks: clicks(2),
        }),
      ),
      JSON.stringify(
        line('session:start', 2.001, {
          exerciseId: 'x',
          bpm: 60,
          latencyMs: 73,
          slope: 1,
          slots: slots(2),
          clicks: clicks(2),
        }),
      ),
      JSON.stringify(line('hit', 3, { t: 1.08, peakDb: -20 })),
      JSON.stringify(line('output', 3.5, { ctxTime: 10, outputMs: 12, bgDb: -70, state: 'running' })),
      JSON.stringify(line('hit', 4, { t: 1.6, peakDb: -22 })),
      JSON.stringify(line('session:done', 5, { exerciseId: 'x', bpm: 60, stats: stats({ good: 2 }), markdown: '# r' })),
      JSON.stringify(
        line('session:start', 10, { exerciseId: 'x', bpm: 60, latencyMs: 73, slope: 1, slots: slots(2), clicks: [] }),
      ),
      JSON.stringify(line('hit', 11, { t: 1.0, peakDb: -20 })),
      JSON.stringify(
        line('session:start', 20, { exerciseId: 'y', bpm: 80, latencyMs: 73, slope: 1, slots: slots(2), clicks: [] }),
      ),
      JSON.stringify(line('session:done', 21, { exerciseId: 'y', bpm: 80, stats: stats({ miss: 2 }), markdown: '' })),
      '{"event":"hit","at":"2026-09-12T06:00:30.000Z","se',
    ].join('\n')
    const lines = parseLines(text)
    expect(lines).toHaveLength(13)
    const recs = splitSessions(lines, 'dev')
    expect(recs).toHaveLength(3)
    expect(recs[0].hits).toHaveLength(2)
    expect(recs[0].outputs).toHaveLength(1)
    expect(recs[0].done?.event).toBe('session:done')
    expect(recs[0].calibration?.latencyMs).toBe(73)
    expect(recs[0].engine?.deviceLabel).toBe('mic')
    expect(recs[1].done).toBeNull()
    expect(recs[1].hits).toHaveLength(1)
    expect(recs[2].start.exerciseId).toBe('y')
  })
})

describe('analyzeSession', () => {
  it('re-judges the notes like the app and matches the logged counts', () => {
    const lines = [
      engine(0),
      ...calibrated(1, 73, [73, 73, 73, 73, 73, 73, 73, 73]),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 73,
        slope: 1,
        options: {},
        slots: slots(4),
        clicks: [],
      }),
      // raw = corrected + 73 ms: on time, +30 ms (ok), missing, on time, and one stray past the last window
      line('hit', 3, { t: 1.078, peakDb: -20 }),
      line('hit', 3.5, { t: 1.603, peakDb: -21 }),
      line('hit', 4.5, { t: 2.573, peakDb: -19 }),
      line('hit', 4.8, { t: 2.873, peakDb: -25 }),
      line('session:done', 5, {
        exerciseId: 'x',
        bpm: 60,
        stats: stats({ good: 2, ok: 1, miss: 1, extras: 1 }),
        markdown: '# r',
      }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.regrade).toMatchObject({ good: 2, ok: 1, off: 0, miss: 1, extras: 1, matchesApp: true })
    expect(a.notes.map((n) => n.grade)).toEqual(['good', 'ok', 'miss', 'good'])
    expect(a.notes[1].offsetMs).toBeCloseTo(30, 0)
    expect(a.notes[0].hand).toBe('R')
    expect(a.extras).toHaveLength(1)
    expect(a.calibration.r2).toBeCloseTo(0.999, 3)
    expect(a.markdown).toBe('# r')
    expect(a.trust.verdicts.map((v) => v.key)).toEqual(['clean'])
  })

  it('flags click echoes, double triggers, floor hits and an inhuman sigma', () => {
    const n = 24
    const hits: LogLine[] = []
    for (let i = 0; i < n; i++) hits.push(line('hit', 3 + i, { t: 1 + i * 0.5 + 0.073, peakDb: -18 }))
    hits.push(line('hit', 3.05, { t: 1.123, peakDb: -33 })) // 50 ms after a −18 dB hit, 15 dB lower: a pad tail (and above the floor margin)
    hits.push(line('hit', 3.3, { t: 1.3, peakDb: -36 })) // within 6 dB of the −40 floor
    const lines = [
      engine(0),
      ...calibrated(1, 73, [73, 73, 73, 73, 73, 73, 73, 73]),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 73,
        slope: 1,
        options: {},
        slots: slots(n),
        clicks: clicks(n),
      }),
      ...hits,
      line('session:done', 40, { exerciseId: 'x', bpm: 60, stats: stats({ good: n, extras: 2 }), markdown: '' }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.trust.hits).toBe(n + 2)
    expect(a.trust.echo).toBe(n)
    expect(a.trust.doubles).toBe(1)
    expect(a.trust.floor).toBe(1)
    expect(a.trust.sigmaMs).toBeCloseTo(0, 3)
    const keys = a.trust.verdicts.map((v) => `${v.key}:${v.level}`)
    expect(keys).toContain('echo:bad')
    expect(keys).toContain('doubles:warn')
    expect(keys).toContain('sigma:bad')
    expect(a.notes[0].flags).toEqual(['echo'])
    expect(a.extras.some((e) => e.flags.includes('double'))).toBe(true)
  })

  it('grades the detector against the synthetic truth', () => {
    const lines = [
      engine(0, { synth: { seed: 42, preset: 'steady', latencyMs: 35, headphones: true } }),
      ...calibrated(1, 35, [35, 35, 35, 35, 35, 35, 35, 35]),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 35,
        slope: 1,
        options: {},
        slots: slots(3),
        clicks: [],
      }),
      line('session:truth', 2, {
        preset: 'steady',
        seed: 42,
        latencyMs: 35,
        headphones: true,
        strokes: [
          { t: 1.0, peakDb: -18, slot: 0 },
          { t: 1.5, peakDb: -18, slot: 1 },
          { t: 2.0, peakDb: -18, slot: 2 },
        ],
      }),
      line('hit', 3, { t: 1.035, peakDb: -18 }),
      line('hit', 3.5, { t: 1.543, peakDb: -19 }),
      line('hit', 3.7, { t: 1.735, peakDb: -30 }),
      line('session:done', 5, {
        exerciseId: 'x',
        bpm: 60,
        stats: stats({ good: 2, miss: 1, extras: 1 }),
        markdown: '',
      }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.synthetic).toMatchObject({
      preset: 'steady',
      seed: 42,
      strokes: 3,
      detected: 2,
      missed: 1,
      falseHits: 1,
      oracle: null,
    })
    expect(a.synthetic?.timingMs.mean).toBeCloseTo(4, 0)
    expect(a.synthetic?.levelDb.mean).toBeCloseTo(-0.5, 1)
    expect(a.trust.verdicts.some((v) => v.key === 'synthetic' && v.level === 'bad')).toBe(true)
  })

  it('warns on a synthetic run logged without truth and still reads slots without dur', () => {
    const old = slots(2).map(({ dur: _dur, bar: _b, beat: _be, sub: _s, ...rest }) => rest)
    const lines = [
      engine(0, { synth: { seed: 1, preset: 'human', latencyMs: 35, headphones: true } }),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 35,
        slope: null,
        options: {},
        slots: old,
        clicks: [],
      }),
      line('hit', 3, { t: 1.04, peakDb: -20 }),
      line('session:done', 5, { exerciseId: 'x', bpm: 60, stats: stats({ good: 1, miss: 1 }), markdown: '' }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.notes.map((n) => n.grade)).toEqual(['good', 'miss'])
    expect(a.synthetic).toBeNull()
    expect(a.trust.verdicts.some((v) => v.key === 'truth')).toBe(true)
  })

  it("drops count-in hits at the logged countInEnd/minStepDur, not at the first slot's own t/dur", () => {
    // Logged countInEnd 1.0 s, minStepDur 0.2 s (mixed subdivisions elsewhere in the grid): the
    // runner's own threshold is countInEnd − minStepDur/2 = 1.0 − 0.1 = 0.9 s. The first slot itself
    // sits at 1.3 s with dur 0.5 s (a rest before it), so the old "first.t − first.dur/2" rule would
    // have used 1.3 − 0.25 = 1.05 s and wrongly dropped a hit at 0.95 s (0.9 ≤ 0.95 < 1.05) that the
    // runner kept. With the fix the hit survives, misses its only slot's window (±0.25 s around 1.3)
    // and lands as an extra.
    const lines = [
      engine(0),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 0,
        slope: null,
        options: {},
        countInEnd: 1.0,
        minStepDur: 0.2,
        slots: [
          { i: 0, t: 1.3, dur: 0.5, hand: 'R', accent: false, ornament: null, repeat: 0, bar: 0, beat: 0, sub: 0 },
        ],
        clicks: [],
      }),
      line('hit', 3, { t: 0.95, peakDb: -20 }),
      line('session:done', 5, { exerciseId: 'x', bpm: 60, stats: stats({ miss: 1, extras: 1 }), markdown: '' }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.extras).toHaveLength(1)
    expect(a.extras[0].t).toBeCloseTo(0.95, 5)
    expect(a.notes[0].grade).toBe('miss')
  })

  it('keeps the guide click out of the echo signal and flags that the guide was on', () => {
    // latency 50 ms; a beat click at t=1.0 and an off-beat guide note click at t=1.2. A raw hit at
    // click + latency lands exactly on each: 1.05 s for the beat, 1.25 s for the note. Only the beat
    // click is a real metronome click for the echo check — the note is what the drummer is meant to
    // play on, so a stroke landing there is not evidence of an echo.
    const lines = [
      engine(0),
      line('session:start', 2, {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 50,
        slope: null,
        options: {},
        slots: slots(1),
        clicks: [
          { t: 1.0, kind: 'beat', silent: false },
          { t: 1.2, kind: 'note', silent: false },
        ],
      }),
      line('hit', 3, { t: 1.05, peakDb: -20 }),
      line('hit', 3.1, { t: 1.25, peakDb: -20 }),
      line('session:done', 5, { exerciseId: 'x', bpm: 60, stats: stats({ miss: 1, extras: 1 }), markdown: '' }),
    ]
    const a = analyzeSession(splitSessions(lines, 'dev')[0], deps)
    expect(a.trust.echo).toBe(1)
    expect(a.trust.verdicts.some((v) => v.key === 'guide' && v.level === 'warn')).toBe(true)
  })
})

describe('analyzeCalibrations / errorBudget', () => {
  it('lists calibrations with repeatability, drift, context delta and processing flags', () => {
    const lines = [
      engine(0, { settings: { echoCancellation: false, noiseSuppression: true } }),
      ...calibrated(1, 73.3, [73.3, 73.3, 73.3, 73.3, 73.3, 73.3, 73.3, 73.3]),
      ...calibrated(60, 75.0, [74, 76, 75, 75, 74, 76, 75, 75]),
    ]
    const cal = analyzeCalibrations(lines, 'dev')
    expect(cal.rows).toHaveLength(2)
    expect(cal.rows[0].offsetSdMs).toBeCloseTo(0, 3)
    expect(cal.rows[1].offsetSdMs).toBeGreaterThan(0.5)
    expect(cal.rows[1].contextMs).toBeCloseTo(15.27, 2)
    expect(cal.rows[1].deltaMs).toBeCloseTo(59.73, 2)
    expect(cal.rows[1].processing).toEqual({ echoCancellation: false, noiseSuppression: true })
    expect(cal.driftSdMs).toBeCloseTo(1.2, 1)
    expect(cal.verdicts.some((v) => v.key === 'processing')).toBe(true)
    const budget = errorBudget(cal, [], 48000)
    expect(budget.terms.map((t) => t.key)).toEqual(['block', 'hold', 'repeat', 'drift', 'output'])
    expect(budget.terms[0].ms).toBeCloseTo(1.333, 3)
    expect(budget.totalMs).toBeGreaterThan(1.3)
    expect(budget.goodMs).toBe(20)
  })
})
