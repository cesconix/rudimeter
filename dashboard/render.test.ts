// The dashboard is the one place an append-only device key met an admin session. `detail()` interpolated
// `options.metronome.clickSubdivision` — raw, unvalidated JSON off a `session:start` line — into the
// fragment `main.ts` assigns to `innerHTML`, and `when()` did the same with `at`. A tester key was
// therefore script execution in the admin's browser, same-origin, with `/api/lines?device=*` for every
// device behind it. These tests feed the builders what a hostile key would write and demand markup.

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { CalibrationAnalysis, LogLine, SessionAnalysis } from '../src/analysis/analysis'
import { analyzeSession, splitSessions } from '../src/analysis/analysis'
import { deviceReportFromLines } from '../src/analysis/device-report'
import { calibrationPanel, detail, sessionsTable } from './render'

const PAYLOAD = '<img src=x onerror=alert(1)>'

/** A session the analysis would produce, with only the fields these builders read filled in. */
const session = (over: Partial<SessionAnalysis> = {}): SessionAnalysis =>
  ({
    id: 'marco@2026-09-13T10:00:00.000Z',
    device: 'marco',
    exerciseId: 'singles',
    bpm: 60,
    startedAt: '2026-09-13T10:00:00.000Z',
    endedAt: null,
    complete: true,
    stopped: false,
    aborted: false,
    orphan: false,
    replans: 0,
    t0: 0,
    durationS: 10,
    options: { metronome: { clickSubdivision: 1, guide: false, gap: false }, autoIncrement: false },
    calibration: { latencyMs: 70, slope: 1, r2: 1, deviceLabel: 'mic' },
    engine: { deviceLabel: 'mic', sampleRate: 48000, outputLatencyMs: 10, synth: false, settings: {} },
    stats: null,
    regrade: { good: 1, ok: 0, off: 0, miss: 0, extras: 0, absorbed: 0, matchesApp: true },
    notes: [],
    extras: [],
    clicks: [],
    outputSeries: [],
    trust: {
      hits: 1,
      echo: 0,
      echoCandidates: 0,
      echoResidualSdMs: null,
      countInClicks: 0,
      countInEchoes: 0,
      doubles: 0,
      floor: 0,
      sigmaMs: null,
      output: { mean: null, sd: null, max: null },
      gaps: 0,
      outputGapIndices: [],
      notRunning: 0,
      verdicts: [],
    },
    synthetic: null,
    feedback: [],
    markdown: null,
    ...over,
  }) as SessionAnalysis

describe('the builders that reach innerHTML', () => {
  it('renders no tag from a hostile options, at or exerciseId', () => {
    const hostile = session({
      exerciseId: PAYLOAD,
      startedAt: `2026${PAYLOAD}`,
      // Past the narrowing on purpose: the builder has to hold on its own, whatever it is handed.
      options: { metronome: { clickSubdivision: PAYLOAD } } as unknown as SessionAnalysis['options'],
      feedback: [{ at: `2026${PAYLOAD}`, text: PAYLOAD, source: PAYLOAD } as unknown as SessionAnalysis['feedback'][0]],
    })
    const html = `${detail(hostile, 60)}${sessionsTable([hostile], null)}`
    expect(html).toContain('&lt;img src=x')
    expect(html).not.toContain(PAYLOAD)
    // Nothing log-derived may open a tag: the only `<` left are the ones these builders wrote.
    expect(html.replace(/<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>/gi, '')).not.toContain('<')
  })

  it('renders a device whose `at` is not a string at all, instead of throwing and blanking it', () => {
    const broken = session({ startedAt: 123 as unknown as string })
    expect(() => detail(broken, 60)).not.toThrow()
    expect(sessionsTable([broken], null)).toContain('—')
    const row = {
      at: 123,
      latencyMs: 70,
      offsetSdMs: null,
      offsetMinMs: null,
      offsetMaxMs: null,
      n: 8,
      slope: null,
      r2: null,
      deviceLabel: 'mic',
      contextMs: null,
      deltaMs: null,
      processing: {},
    }
    const cal = { rows: [row], verdicts: [], driftSdMs: null } as unknown as CalibrationAnalysis
    expect(() => calibrationPanel(cal, { terms: [], totalMs: null, goodMs: 15, okMs: 40 })).not.toThrow()
  })

  it('narrows a hostile `session:start.options` before it ever reaches a builder', () => {
    const lines = [
      {
        event: 'session:start',
        at: '2026-09-13T10:00:00.000Z',
        seq: 1,
        exerciseId: 'singles',
        bpm: 60,
        options: PAYLOAD,
      },
      { event: 'session:done', at: '2026-09-13T10:01:00.000Z', seq: 2 },
    ]
    const [record] = splitSessions(lines, 'marco')
    const a = analyzeSession(record, { exerciseById: () => undefined })
    expect(a.options).toEqual({
      metronome: { clickSubdivision: 1, guide: false, gap: false },
      autoIncrement: false,
    })
  })
})

describe('the dashboard document', () => {
  it('ships a CSP that keeps an injected script from running as the admin', () => {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(
      readFileSync(new URL('index.html', import.meta.url), 'utf8'),
    )?.[1]
    expect(csp).toContain("default-src 'self'")
    // 'unsafe-inline' is granted to style-src only: widening it to scripts would undo the whole point.
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
    expect(csp?.replace(/style-src[^;]*/, '')).not.toContain('unsafe-inline')
  })
})

/**
 * The sweep, as a standing check. Nobody owns validating a logged line — `/api/log` stores any JSON
 * object, `parseLines` only casts — so the analysis is where a claim becomes a value. Every field a
 * device key can write is fed a payload, a number, null, an object, an array of nulls and an array of
 * payloads, through the exact path `renderDevice()` takes: one bad field used to throw somewhere in
 * there and leave the device blank on every load, which is as effective as deleting it.
 */
describe('a hostile line anywhere in a device log', () => {
  const HOSTILE: unknown[] = [PAYLOAD, 7, null, {}, [null], [PAYLOAD], true, [{ t: PAYLOAD, kind: PAYLOAD }]]
  const FIELDS = [
    'slots',
    'clicks',
    'options',
    'bpm',
    'exerciseId',
    'latencyMs',
    'slope',
    'minStepDur',
    'countInEnd',
    'at',
    'stats',
    'markdown',
    'aborted',
    'stopped',
    'orphan',
    'strokes',
    'preset',
    'seed',
    'headphones',
    'offsetsMs',
    'fit',
    'settings',
    'deviceLabel',
    'sampleRate',
    'outputLatencyMs',
    'baseLatencyMs',
    'floorDb',
    'synth',
    't',
    'peakDb',
    'ctxTime',
    'outputMs',
    'bgDb',
    'state',
    'text',
    'source',
    'sessionId',
    'error',
    'lines',
    'dropped',
    'kind',
    'silent',
    'i',
    'dur',
    'hand',
    'accent',
    'repeat',
    'bar',
    'beat',
    'sub',
  ]
  const slot = { i: 0, t: 1, dur: 0.5, hand: 'R', accent: false, repeat: 0, bar: 0, beat: 0, sub: 0 }

  const log = (field: string, value: unknown): LogLine[] => {
    let seq = 0
    const l = (event: string, over: Record<string, unknown>) =>
      ({ event, at: '2026-09-13T10:00:00.000Z', seq: ++seq, ...over, [field]: value }) as unknown as LogLine
    return [
      l('engine', {
        deviceLabel: 'mic',
        sampleRate: 48000,
        outputLatencyMs: 10,
        baseLatencyMs: 2,
        settings: {},
        floorDb: -40,
      }),
      l('calibration:measured', { offsetsMs: [1, 2, 3], fit: { r2: 0.99 } }),
      l('calibration:done', { latencyMs: 70, slope: 1, deviceLabel: 'mic' }),
      l('session:start', {
        exerciseId: 'x',
        bpm: 60,
        latencyMs: 73,
        slope: 1,
        options: {},
        slots: [slot],
        clicks: [{ t: 0.5, kind: 'bar', silent: false }],
      }),
      l('session:truth', { preset: 'tight', seed: 1, strokes: [{ t: 1, peakDb: -20, slot: 0 }] }),
      l('hit', { t: 1.01, peakDb: -20 }),
      l('output', { ctxTime: 1, outputMs: 12, bgDb: -70, state: 'running' }),
      l('session:feedback', { sessionId: 'd@2026-09-13T10:00:00.000Z', text: 'hi', source: 'app' }),
      l('flush:retry', { lines: 2, dropped: 0, error: 'x' }),
      l('session:done', { stats: { good: 1, ok: 0, off: 0, miss: 0, extras: 0 }, markdown: '# r' }),
    ]
  }

  it('still renders the device, and renders no tag, whichever field it poisons', () => {
    const broken: string[] = []
    for (const field of FIELDS) {
      for (const [i, value] of HOSTILE.entries()) {
        try {
          const r = deviceReportFromLines('d', log(field, value), { exerciseById: () => undefined }, 50)
          let html = sessionsTable(r.sessions, null) + calibrationPanel(r.calibrations, r.budget)
          for (const s of r.sessions) html += detail(s, 60)
          if (html.includes(PAYLOAD)) broken.push(`${field}#${i}: rendered the payload raw`)
        } catch (err) {
          broken.push(`${field}#${i}: ${(err as Error).message}`)
        }
      }
    }
    expect(broken).toEqual([])
  })
})
