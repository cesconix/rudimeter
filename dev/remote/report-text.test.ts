import { describe, expect, it } from 'bun:test'
import type { CalibrationAnalysis, SessionAnalysis } from './analysis'
import { formatCalibrations, formatTable, formatVerdict } from './report-text'

const session = (over: Partial<SessionAnalysis> = {}): SessionAnalysis => ({
  id: 'iphone@2026-09-12T06:23:00.000Z',
  device: 'iphone',
  exerciseId: 'stone-1',
  bpm: 60,
  startedAt: '2026-09-12T06:23:00.000Z',
  endedAt: '2026-09-12T06:24:20.000Z',
  complete: true,
  stopped: false,
  aborted: false,
  orphan: false,
  replans: 0,
  t0: 1,
  durationS: 80,
  options: {},
  calibration: { latencyMs: 73.3, slope: 1.02, r2: 0.9999, deviceLabel: 'iPhone Microphone' },
  engine: { deviceLabel: 'iPhone Microphone', sampleRate: 48000, outputLatencyMs: 12.6, synth: false, settings: {} },
  stats: null,
  regrade: { good: 80, ok: 0, off: 0, miss: 80, extras: 0, absorbed: 0, matchesApp: true },
  notes: [],
  extras: [],
  clicks: [],
  outputSeries: [],
  trust: {
    hits: 82,
    echo: 82,
    echoCandidates: 82,
    echoResidualSdMs: 0.01,
    countInClicks: 2,
    countInEchoes: 2,
    doubles: 0,
    floor: 0,
    sigmaMs: 0.01,
    output: { mean: 12.6, sd: 0.1, max: 12.8 },
    gaps: 0,
    outputGapIndices: [],
    notRunning: 0,
    verdicts: [{ key: 'echo', level: 'bad', text: '82/82 hits sit at click + 73.3 ms' }],
  },
  synthetic: null,
  markdown: null,
  ...over,
})

describe('report-text', () => {
  it('formatTable: one line per session with the counts and the worst verdict', () => {
    const text = formatTable([session(), session({ trust: { ...session().trust, verdicts: [] } })])
    const rows = text.trimEnd().split('\n')
    expect(rows).toHaveLength(3) // header + 2
    expect(rows[1]).toContain('stone-1')
    expect(rows[1]).toContain('80/0/0/80+0')
    expect(rows[1]).toContain('echo 100%')
    expect(rows[1]).toContain('bad')
  })
  it('formatVerdict: header, every verdict, counts, synthetic block when present', () => {
    const a = session({
      synthetic: {
        preset: 'steady',
        seed: 42,
        strokes: 160,
        detected: 159,
        missed: 1,
        falseHits: 0,
        timingMs: { mean: 0.3, sd: 1.1, max: 2.6 },
        levelDb: { mean: 0, sd: 0.2, max: 0.5 },
        oracle: { miss: 0, extras: 0, meanOffsetMs: 0.1 },
      },
    })
    const text = formatVerdict(a)
    expect(text).toContain('iphone')
    expect(text).toContain('82/82 hits sit at click')
    expect(text).toContain('good 80')
    expect(text).toContain('detected 159/160')
    expect(text).toContain('Δmiss 0')
  })
  it('formatCalibrations: rows, drift and the budget total', () => {
    const cal: CalibrationAnalysis = {
      device: 'iphone',
      rows: [
        {
          at: '2026-09-12T06:21:56.861Z',
          latencyMs: 73.333,
          offsetSdMs: 0,
          offsetMinMs: 73.333,
          offsetMaxMs: 73.333,
          n: 8,
          slope: 1.02,
          r2: 0.9999,
          deviceLabel: 'iPhone Microphone',
          contextMs: 15.27,
          deltaMs: 58.06,
          processing: {
            echoCancellation: 'off',
            noiseSuppression: 'not reported',
            autoGainControl: 'not reported',
            voiceIsolation: 'not reported',
          },
        },
      ],
      driftSdMs: null,
      verdicts: [{ key: 'clean', level: 'ok', text: 'calibration stable.' }],
    }
    const text = formatCalibrations(cal, {
      terms: [{ key: 'block', label: 'worklet block', ms: 1.333, source: 'fixed', note: '' }],
      totalMs: 1.333,
      goodMs: 20,
      okMs: 40,
    })
    expect(text).toContain('73.3')
    expect(text).toContain('worklet block')
    expect(text).toContain('±1.3 ms')
    expect(text).toContain('good ±20')
  })
})
