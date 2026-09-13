// What the telemetry logged (a device's lines: /api/log → the store, once .remote/<device>.ndjson), read back as answers:
// per session, how the strokes matched the score and how far the detection can be trusted; per device,
// how precise and stable the calibration is. Pure — bun test, the CLI and the dashboard page share it.
import { type ClickKind, isGuide } from '../engine/grid'
import { judge } from '../engine/judge'
import { mean, type SessionStats, sd } from '../engine/stats'
import { DEFAULT_WINDOWS, type Exercise, type Grade, type Hand, type Hit, type Slot } from '../engine/types'
import { type OracleConfig, runOracle } from '../sim/oracle'
import type { PlayerPreset } from '../sim/player'

export interface LogLine {
  event: string
  at: string
  seq: number
  [key: string]: unknown
}

/** A slot as `session:start` logs it. `dur`, `bar`, `beat`, `sub`, `ornament` arrived on 2026-09-12: older logs lack them. */
export interface LoggedSlot {
  i: number
  t: number
  dur?: number
  hand: Hand
  accent: boolean
  ornament?: string | null
  repeat: number
  bar?: number
  beat?: number
  sub?: number
}
export interface LoggedClick {
  t: number
  kind: string
  silent: boolean
}
export interface RawHit {
  t: number
  peakDb: number
}
export interface OutputSample {
  ctxTime: number
  outputMs: number
  bgDb: number
  state: string
}
export interface TruthStroke {
  t: number
  peakDb: number
  slot: number | null
}

/** A comment on a session, from the box at the end of it (`app`) or from the dashboard after the fact. */
export interface Feedback {
  at: string
  text: string
  source: 'app' | 'dashboard'
}

export interface SessionRecord {
  device: string
  start: LogLine
  grid: { slots: LoggedSlot[]; clicks: LoggedClick[] }
  replans: number
  done: LogLine | null
  hits: RawHit[]
  outputs: OutputSample[]
  engine: LogLine | null
  calibration: LogLine | null
  measured: LogLine | null
  truth: LogLine | null
  errors: LogLine[]
  feedback: LogLine[]
}

export type Level = 'ok' | 'warn' | 'bad'
export interface Verdict {
  key: string
  level: Level
  text: string
}
export interface NoteRow {
  i: number
  bar: number
  beat: number
  sub: number
  hand: Hand
  accent: boolean
  t: number
  hitT: number | null
  offsetMs: number | null
  peakDb: number | null
  grade: Grade
  flags: string[]
}
export interface ExtraRow {
  t: number
  peakDb: number
  flags: string[]
}
export interface Spread {
  mean: number | null
  sd: number | null
  /** largest absolute value */
  max: number | null
}
export interface SyntheticBlock {
  preset: string
  seed: number
  strokes: number
  detected: number
  missed: number
  falseHits: number
  timingMs: Spread
  levelDb: Spread
  /** app stats minus oracle stats; null when the exercise is unknown or the run was stopped */
  oracle: { miss: number; extras: number; meanOffsetMs: number } | null
}
export interface SessionAnalysis {
  id: string
  device: string
  exerciseId: string
  bpm: number
  startedAt: string
  endedAt: string | null
  complete: boolean
  stopped: boolean
  aborted: boolean
  /** reconstructed from a `session:done` whose `session:start` never reached the file: no grid to judge */
  orphan: boolean
  replans: number
  /** first slot time on the audio clock, and the span to the end of the last slot */
  t0: number
  durationS: number
  options: Record<string, unknown>
  calibration: { latencyMs: number; slope: number | null; r2: number | null; deviceLabel: string }
  engine: {
    deviceLabel: string
    sampleRate: number | null
    outputLatencyMs: number | null
    synth: boolean
    settings: Record<string, unknown>
  }
  /** as the app logged them in session:done */
  stats: SessionStats | null
  regrade: {
    good: number
    ok: number
    off: number
    miss: number
    extras: number
    absorbed: number
    matchesApp: boolean | null
  }
  notes: NoteRow[]
  extras: ExtraRow[]
  clicks: LoggedClick[]
  /** the `output` samples as they were logged, ~1 a second: a few KB per session, drawn as a line */
  outputSeries: { t: number; ms: number }[]
  trust: {
    hits: number
    /** hits the echo check stands behind: `echoCandidates` when corroborated, 0 otherwise */
    echo: number
    /** raw hits sitting within ±10 ms of click + latency, corroborated or not */
    echoCandidates: number
    /** σ of the candidates' distance from click + latency: a real echo barely scatters, a drummer does */
    echoResidualSdMs: number | null
    /** audible metronome clicks before the first slot, and how many of them a hit answered */
    countInClicks: number
    countInEchoes: number
    doubles: number
    floor: number
    sigmaMs: number | null
    output: Spread
    gaps: number
    /** indices into `outputSeries` a gap precedes, so the sparkline can mark where the clock jumped */
    outputGapIndices: number[]
    notRunning: number
    verdicts: Verdict[]
  }
  synthetic: SyntheticBlock | null
  markdown: string | null
  /** in file order; text for whoever reads the numbers, never a signal */
  feedback: Feedback[]
}
export interface AnalyzeDeps {
  exerciseById(id: string): Exercise | undefined
}

/** A raw hit this close to click + latency is a candidate for the click coming back through the microphone. */
const ECHO_MS = 10
/**
 * A candidate alone proves nothing: a drummer on time on a click beat lands in the same ±10 ms window.
 * What separates them is scatter. On the fixtures a real echo holds residual σ 0.01 ms (iphone) and
 * 0.42 ms (mac) — it is the click itself, delayed by a fixed path — while strokes on the beat scatter
 * σ 3.15 ms and 5.28 ms. Eight candidates are enough for that σ to mean something.
 */
const ECHO_MIN_CANDIDATES = 8
const ECHO_RESIDUAL_SIGMA_MS = 2
/**
 * The other corroboration, independent of σ: during the count-in there is nothing to play yet, so a hit
 * on a count-in click can only be that click coming back. Both fixtures with a real echo answer 2/2
 * count-in clicks; both runs of on-time strokes answer 0/2.
 */
const COUNT_IN_MIN_CLICKS = 2
const COUNT_IN_ECHO_SHARE = 0.5
/** A stroke and its detection are the same event within this window; beyond it, a miss and a false hit. */
const TRUTH_MS = 20
/** The pad's tail past the 40 ms refractory: seen on the iPhone 40–56 ms after loud hits, 20 dB down. */
const DOUBLE_MIN_MS = 40
const DOUBLE_MAX_MS = 80
const DOUBLE_DROP_DB = 12
const FLOOR_MARGIN_DB = 6
/** No drummer holds σ under 5 ms; under 2 ms the source is synchronous with the clock (the click itself). */
const HUMAN_SIGMA_MS = 2
const SIGMA_MIN_NOTES = 20
const OUTPUT_GAP_S = 2.5

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const spread = (xs: number[]): Spread => ({
  mean: mean(xs),
  sd: sd(xs),
  max: xs.length ? Math.max(...xs.map((x) => Math.abs(x))) : null,
})

export function parseLines(text: string): LogLine[] {
  const out: LogLine[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      out.push(JSON.parse(raw) as LogLine)
    } catch {
      // The last line of a file still being appended can be torn: skip it, the next read sees it whole.
    }
  }
  return out
}

const gridOf = (l: LogLine): SessionRecord['grid'] => ({
  slots: (l.slots as LoggedSlot[] | undefined) ?? [],
  clicks: (l.clicks as LoggedClick[] | undefined) ?? [],
})

export const feedbackOf = (l: LogLine): Feedback => ({
  at: l.at,
  text: String(l.text ?? ''),
  source: l.source === 'dashboard' ? 'dashboard' : 'app',
})

export function splitSessions(lines: LogLine[], device: string): SessionRecord[] {
  const out: SessionRecord[] = []
  let engine: LogLine | null = null
  let calibration: LogLine | null = null
  let measured: LogLine | null = null
  let open: SessionRecord | null = null
  // Hits logged while no session is open. An armed engine and a stale tab both log them legitimately,
  // so they never open a record on their own — but if a `session:done` turns up with no `session:start`
  // (the batch carrying it was lost, see `flush:retry`), they are that session's hits.
  let stray: RawHit[] = []
  let strayFrom: LogLine | null = null
  // `session:feedback` lines in file order, each with the record it belongs to. The app sends one from
  // the summary, after the `session:done`, with no id: it is the last record closed at that point. The
  // dashboard sends one for a session picked from its table, by id, days later if need be: resolved once
  // every record exists, at the end. Attaching both afterwards keeps the file order inside a session.
  const feedback: { line: LogLine; target: SessionRecord | null }[] = []
  const close = (): void => {
    if (open) out.push(open)
    open = null
    stray = []
    strayFrom = null
  }
  for (const l of lines) {
    switch (l.event) {
      case 'engine':
        engine = l
        break
      case 'calibration:done':
        calibration = l
        break
      case 'calibration:measured':
        measured = l
        break
      case 'session:start': {
        // React StrictMode mounts the session twice in dev: two `session:start` a millisecond apart, the
        // first from a runner torn down before it heard anything. The second one is the session.
        const ghost =
          open !== null &&
          open.hits.length === 0 &&
          open.outputs.length === 0 &&
          Date.parse(l.at) - Date.parse(open.start.at) < 2000
        if (!ghost) close()
        open = {
          device,
          start: l,
          grid: gridOf(l),
          replans: 0,
          done: null,
          hits: [],
          outputs: [],
          engine,
          calibration,
          measured,
          truth: null,
          errors: [],
          feedback: [],
        }
        break
      }
      case 'session:replan':
        if (open) {
          open.grid = gridOf(l)
          open.replans++
        }
        break
      case 'session:truth':
        if (open) open.truth = l
        break
      case 'hit': {
        const hit: RawHit = { t: Number(l.t), peakDb: Number(l.peakDb) }
        if (open) open.hits.push(hit)
        else {
          stray.push(hit)
          strayFrom ??= l
        }
        break
      }
      case 'output':
        open?.outputs.push({
          ctxTime: Number(l.ctxTime),
          outputMs: Number(l.outputMs),
          bgDb: Number(l.bgDb),
          state: String(l.state),
        })
        break
      case 'cmd:error':
      case 'calibration:failed':
      // A log batch the page had to send again (src/dev/remote.ts): the lines around it reached the
      // file out of their original order, and whatever the bound dropped never reached it at all.
      case 'flush:retry':
        open?.errors.push(l)
        break
      case 'session:feedback':
        feedback.push({ line: l, target: typeof l.sessionId === 'string' ? null : (out[out.length - 1] ?? null) })
        break
      case 'session:done': {
        if (open) {
          open.done = l
          close()
          break
        }
        // No `session:start` on disk, but the hits and the app's own report are: keep the session and
        // mark it, rather than dropping a run that happened. The grid is gone with the start line, so
        // there is nothing to re-judge against — `analyzeSession` says so instead of guessing.
        const from = strayFrom ?? l
        out.push({
          device,
          start: {
            event: 'session:start',
            at: from.at,
            seq: from.seq,
            orphan: true,
            exerciseId: l.exerciseId,
            bpm: l.bpm,
          },
          grid: { slots: [], clicks: [] },
          replans: 0,
          done: l,
          hits: stray,
          outputs: [],
          engine,
          calibration,
          measured,
          truth: null,
          errors: [],
          feedback: [],
        })
        stray = []
        strayFrom = null
        break
      }
      default:
        break
    }
  }
  close()
  for (const f of feedback) {
    const id = f.line.sessionId
    const target = typeof id === 'string' ? (out.find((r) => `${device}@${r.start.at}` === id) ?? null) : f.target
    target?.feedback.push(f.line)
  }
  return out
}

/**
 * The `session:feedback` lines `splitSessions` attached to nothing: an unknown id, or a comment before
 * any session had closed. Out of the analysis, since there is nothing to hang them on; the CLI lists
 * them all the same, so a comment typed in earnest does not vanish.
 *
 * Callers must pass the same `lines` array `splitSessions` received: the match against `records` is by
 * object identity, not by value. Today `collectFeedback` is the only caller, and it does.
 */
export function strayFeedback(lines: LogLine[], records: SessionRecord[]): LogLine[] {
  const attached = new Set(records.flatMap((r) => r.feedback))
  return lines.filter((l) => l.event === 'session:feedback' && !attached.has(l))
}

/** Slots as `judge` wants them. Without a logged `dur` (older logs) the gap to the next slot stands in. */
function toSlots(logged: LoggedSlot[]): Slot[] {
  const gaps = logged
    .slice(1)
    .map((s, k) => s.t - logged[k].t)
    .filter((g) => g > 0)
  const minGap = gaps.length ? Math.min(...gaps) : 0.25
  return logged.map((s, k) => ({
    index: s.i,
    t: s.t,
    dur: s.dur ?? (k + 1 < logged.length ? logged[k + 1].t - s.t : minGap),
    step: {
      hand: s.hand,
      accent: s.accent,
      ...(s.ornament ? { ornament: s.ornament as Slot['step']['ornament'] } : {}),
    },
    repeat: s.repeat,
    bar: s.bar ?? 0,
    beat: s.beat ?? 0,
    sub: s.sub ?? 0,
  }))
}

export function analyzeSession(rec: SessionRecord, deps: AnalyzeDeps): SessionAnalysis {
  const start = rec.start
  const latencyMs = num(start.latencyMs) ?? 0
  const slope = num(start.slope)
  const floorDb = num(rec.engine?.floorDb) ?? -40
  const slots = toSlots(rec.grid.slots)
  const clicks = rec.grid.clicks
  const first = slots[0]
  // The guide (metronome.guide on) sounds a stroke on every note (src/engine/grid.ts buildRepeat):
  // from a speaker without headphones it reaches the microphone exactly on the expected instant, so
  // it must not count as a click for the echo check — it would flag every on-grid stroke as an echo.
  const audible = clicks.filter((c) => !c.silent && !isGuide(c.kind as ClickKind))
  // The count-in drop threshold: logged on `session:start` (src/ui/SessionScreen.tsx describe) from the
  // grid in force during the count-in, which is the grid the runner used for those hits. Logs before
  // 2026-09-12 lack the fields; the fallback (first slot's own t/dur) is only exact when the grid has a
  // single subdivision throughout and no leading rest — for anything else it is an approximation.
  const minDur = num(start.minStepDur) ?? (slots.length ? Math.min(...slots.map((s) => s.dur)) : 0)
  const countInEnd = num(start.countInEnd) ?? first?.t ?? 0
  // A synthetic run with headphones on has no speaker path at all: the click is mixed into the
  // headphones, never into the input (see `?headphones=off` in the README for the case that is not
  // this one). Every candidate would be a stroke on the beat, so there is no echo question to ask.
  const headphones =
    (rec.engine?.synth as { headphones?: unknown } | null | undefined)?.headphones === true ||
    rec.truth?.headphones === true

  // Trust flags are found on the raw hits (echo: the click's own delay; doubles: the pad's tail) and
  // travel with the hit object into the judge, which hands the same objects back. Hits are logged in
  // time order, but "the previous hit" must mean the previous in time whatever the log did.
  const raw = [...rec.hits].sort((a, b) => a.t - b.t)
  const flagsOf = new Map<Hit, string[]>()
  const corrected: Hit[] = []
  // Whether the candidates are echoes at all is decided on the whole run, below: the per-hit flag
  // cannot be written while walking the hits, so each candidate keeps the corrected hit it produced
  // (null when the count-in drop removed it, as it still counts as a candidate).
  const candidates: { hit: Hit | null; residualMs: number; countIn: boolean }[] = []
  let doubles = 0
  let floor = 0
  raw.forEach((h, k) => {
    const flags: string[] = []
    // The nearest audible click such that the hit sits within ±ECHO_MS of click + latency; the signed
    // distance to it is the residual the corroboration below reads.
    let nearest: { residualMs: number; countIn: boolean } | null = null
    if (!headphones)
      for (const c of audible) {
        const residualMs = (h.t - c.t) * 1000 - latencyMs
        if (Math.abs(residualMs) > ECHO_MS) continue
        if (nearest === null || Math.abs(residualMs) < Math.abs(nearest.residualMs))
          nearest = { residualMs, countIn: c.t < countInEnd }
      }
    const prev = raw[k - 1]
    if (prev) {
      const dt = (h.t - prev.t) * 1000
      if (dt >= DOUBLE_MIN_MS && dt <= DOUBLE_MAX_MS && h.peakDb <= prev.peakDb - DOUBLE_DROP_DB) {
        doubles++
        flags.push('double')
      }
    }
    if (h.peakDb <= floorDb + FLOOR_MARGIN_DB) {
      floor++
      flags.push('floor')
    }
    // The runner's correction, mirrored (src/session/runner.ts addHit): latency off the time, slope off
    // the level, count-in hits dropped at `countInEnd - minStepDur / 2`.
    const c: Hit = { t: h.t - latencyMs / 1000, peakDb: slope !== null && slope > 0 ? h.peakDb / slope : h.peakDb }
    const kept = c.t >= countInEnd - minDur / 2
    if (nearest) candidates.push({ hit: kept ? c : null, ...nearest })
    if (!kept) return
    corrected.push(c)
    if (flags.length) flagsOf.set(c, flags)
  })

  const echoCandidates = candidates.length
  const echoResidualSdMs = sd(candidates.map((c) => c.residualMs))
  const countInEchoes = candidates.filter((c) => c.countIn).length
  const countInClicks = headphones ? 0 : audible.filter((c) => c.t < countInEnd).length
  // Either corroboration on its own is enough, and each catches what the other cannot: a long session
  // whose count-in the drummer sat out is caught by the scatter, a short one by the count-in.
  const corroborated =
    (echoCandidates >= ECHO_MIN_CANDIDATES && echoResidualSdMs !== null && echoResidualSdMs < ECHO_RESIDUAL_SIGMA_MS) ||
    (countInClicks >= COUNT_IN_MIN_CLICKS && countInEchoes / countInClicks >= COUNT_IN_ECHO_SHARE)
  const echo = corroborated ? echoCandidates : 0
  // `echo` goes in front of the flags the walk above already found, so the order stays echo/double/floor.
  if (corroborated)
    for (const cand of candidates) if (cand.hit) flagsOf.set(cand.hit, ['echo', ...(flagsOf.get(cand.hit) ?? [])])

  const result = judge(slots, corrected, { windows: DEFAULT_WINDOWS })
  const notes: NoteRow[] = result.judged.map((j) => ({
    i: j.slot.index,
    bar: j.slot.bar,
    beat: j.slot.beat,
    sub: j.slot.sub,
    hand: (j.slot.step.hand ?? 'R') as Hand,
    accent: j.slot.step.accent,
    t: j.slot.t,
    hitT: j.hit?.t ?? null,
    offsetMs: j.offsetMs,
    peakDb: j.hit?.peakDb ?? null,
    grade: j.grade,
    flags: j.hit ? (flagsOf.get(j.hit) ?? []) : [],
  }))
  const extras: ExtraRow[] = result.extras.map((h) => ({ t: h.t, peakDb: h.peakDb, flags: flagsOf.get(h) ?? [] }))
  const count = (g: Grade): number => notes.filter((n) => n.grade === g).length
  const counts = {
    good: count('good'),
    ok: count('ok'),
    off: count('off'),
    miss: count('miss'),
    extras: extras.length,
    absorbed: result.absorbed.length,
  }
  const done = rec.done
  const stats = (done?.stats as SessionStats | undefined) ?? null
  const stopped = done?.stopped === true
  // Nothing to compare against without the grid the app judged: the re-grade is not a second opinion here.
  const orphan = start.orphan === true
  const matchesApp =
    stats && !stopped && !orphan
      ? stats.good === counts.good &&
        stats.ok === counts.ok &&
        stats.off === counts.off &&
        stats.miss === counts.miss &&
        stats.extras === counts.extras
      : null

  const offsets = notes.map((n) => n.offsetMs).filter((x): x is number => x !== null)
  const sigmaMs = offsets.length >= SIGMA_MIN_NOTES ? sd(offsets) : null
  const output = spread(rec.outputs.map((o) => o.outputMs))
  const outputSeries = rec.outputs.map((o) => ({ t: o.ctxTime, ms: o.outputMs }))
  // The index the gap precedes, not the count alone: the page draws it on the series, and `gaps` stays
  // the length of this list so the two can never disagree.
  const outputGapIndices = rec.outputs.flatMap((o, k) =>
    k > 0 && o.ctxTime - rec.outputs[k - 1].ctxTime > OUTPUT_GAP_S ? [k] : [],
  )
  const gaps = outputGapIndices.length
  const notRunning = rec.outputs.filter((o) => o.state !== 'running').length
  const r2 = num((rec.measured?.fit as { r2?: unknown } | null | undefined)?.r2)
  const hits = rec.hits.length
  const share = (n: number): number => (hits ? n / hits : 0)
  const verdicts: Verdict[] = []
  const evidence = `residual σ ${echoResidualSdMs === null ? '—' : echoResidualSdMs.toFixed(2)} ms and ${countInEchoes}/${countInClicks} count-in clicks echoed`
  if (corroborated && share(echo) > 0.5)
    verdicts.push({
      key: 'echo',
      level: 'bad',
      text: `${echo}/${hits} hits sit at click + ${latencyMs.toFixed(1)} ms with ${evidence}: the click's own echo — no headphones, or a loopback input. The report describes the click, not the drummer.`,
    })
  else if (corroborated && share(echo) > 0.1)
    verdicts.push({
      key: 'echo',
      level: 'warn',
      text: `${echo}/${hits} hits at click + latency with ${evidence}: some strokes may be the click.`,
    })
  else if (!corroborated && share(echoCandidates) > 0.1)
    verdicts.push({
      key: 'echo',
      level: 'ok',
      text: `${echoCandidates}/${hits} hits sit on click + latency but scatter σ ${echoResidualSdMs === null ? '—' : echoResidualSdMs.toFixed(2)} ms and ${countInEchoes}/${countInClicks} count-in clicks echoed: on-time strokes, not the click.`,
    })
  if (!headphones && clicks.some((c) => isGuide(c.kind as ClickKind)))
    verdicts.push({
      key: 'guide',
      level: 'warn',
      text: 'guide sound on: without headphones its echo lands exactly where an on-grid stroke would, and the echo signal cannot tell them apart.',
    })
  if (doubles)
    verdicts.push({
      key: 'doubles',
      level: 'warn',
      text: `${doubles} double triggers (${DOUBLE_MIN_MS}–${DOUBLE_MAX_MS} ms after a louder hit, ≥ ${DOUBLE_DROP_DB} dB lower): pad tail past the 40 ms refractory.`,
    })
  if (share(floor) > 0.3)
    verdicts.push({
      key: 'floor',
      level: 'warn',
      text: `${floor}/${hits} hits within ${FLOOR_MARGIN_DB} dB of the ${floorDb} dBFS floor: soft strokes are at risk.`,
    })
  if (sigmaMs !== null && sigmaMs < HUMAN_SIGMA_MS)
    verdicts.push({
      key: 'sigma',
      level: 'bad',
      text: `σ offset ${sigmaMs.toFixed(2)} ms over ${offsets.length} notes: no drummer is this steady — a source synchronous with the clock.`,
    })
  if (output.sd !== null && output.sd > 5)
    verdicts.push({
      key: 'output',
      level: 'warn',
      text: `output latency σ ${output.sd.toFixed(1)} ms (max ${(output.max ?? 0).toFixed(1)} ms): the click does not hold still.`,
    })
  if (gaps)
    verdicts.push({
      key: 'gaps',
      level: 'warn',
      text: `${gaps} gaps > ${OUTPUT_GAP_S} s between output samples: tab hidden or context suspended.`,
    })
  if (notRunning)
    verdicts.push({ key: 'state', level: 'warn', text: `${notRunning} output samples with the context not running.` })
  if (slope === null)
    verdicts.push({ key: 'calibration', level: 'warn', text: 'no slope saved: dynamics not corrected.' })
  else if (r2 !== null && r2 < 0.9)
    verdicts.push({
      key: 'calibration',
      level: 'warn',
      text: `ramp r² ${r2.toFixed(2)}: dynamics correction unreliable.`,
    })
  if (matchesApp === false && stats)
    verdicts.push({
      key: 'regrade',
      level: 'warn',
      text: `re-judging the log gives ${counts.good}/${counts.ok}/${counts.off}/${counts.miss}+${counts.extras} vs the app's ${stats.good}/${stats.ok}/${stats.off}/${stats.miss}+${stats.extras}: grading not reproducible from the log.`,
    })
  if (orphan)
    verdicts.push({
      key: 'orphan',
      level: 'warn',
      text: `${hits} hits and a session:done with no session:start: a log batch was lost (see flush:retry).`,
    })
  if (!done) verdicts.push({ key: 'incomplete', level: 'warn', text: 'no session:done: the page left before the end.' })
  if (stopped)
    verdicts.push({
      key: 'stopped',
      level: 'ok',
      text: done?.aborted === true ? 'stopped before the first hit.' : 'stopped early.',
    })
  if (rec.errors.length)
    verdicts.push({
      key: 'errors',
      level: 'warn',
      text: `${rec.errors.length} errors in the window: ${rec.errors.map((e) => String(e.error ?? e.event)).join('; ')}`,
    })

  let synthetic: SyntheticBlock | null = null
  if (rec.truth) {
    let truth = (rec.truth.strokes as TruthStroke[] | undefined) ?? []
    // A stopped run never played its future: only the strokes up to the last hit count as truth.
    if (stopped && corrected.length) {
      const last = corrected[corrected.length - 1].t + 0.5
      truth = truth.filter((s) => s.t <= last)
    }
    const used = new Set<number>()
    const timing: number[] = []
    const level: number[] = []
    for (const s of truth) {
      let best = -1
      let bestD = Number.POSITIVE_INFINITY
      corrected.forEach((h, k) => {
        if (used.has(k)) return
        const d = Math.abs(h.t - s.t) * 1000
        if (d <= TRUTH_MS && d < bestD) {
          best = k
          bestD = d
        }
      })
      if (best < 0) continue
      used.add(best)
      timing.push((corrected[best].t - s.t) * 1000)
      level.push(corrected[best].peakDb - s.peakDb)
    }
    const preset = String(rec.truth.preset) as PlayerPreset
    const seed = Number(rec.truth.seed)
    const ex = deps.exerciseById(String(start.exerciseId))
    const opts = (start.options ?? {}) as {
      metronome?: OracleConfig['metronome']
      autoIncrement?: OracleConfig['autoIncrement'] | null
    }
    let oracle: SyntheticBlock['oracle'] = null
    if (ex && stats && !stopped) {
      const o = runOracle({
        exercise: ex,
        bpm: Number(start.bpm),
        preset,
        seed,
        metronome: opts.metronome,
        autoIncrement: opts.autoIncrement ?? undefined,
      })
      oracle = {
        miss: stats.miss - o.miss,
        extras: stats.extras - o.extras,
        meanOffsetMs: (stats.meanOffsetMs ?? 0) - (o.meanOffsetMs ?? 0),
      }
    }
    synthetic = {
      preset,
      seed,
      strokes: truth.length,
      detected: timing.length,
      missed: truth.length - timing.length,
      falseHits: corrected.length - used.size,
      timingMs: spread(timing),
      levelDb: spread(level),
      oracle,
    }
    if (synthetic.missed || synthetic.falseHits)
      verdicts.push({
        key: 'synthetic',
        level: 'bad',
        text: `detector vs truth: ${synthetic.missed} strokes missed, ${synthetic.falseHits} false hits (window ±${TRUTH_MS} ms).`,
      })
    if (oracle && (oracle.miss !== 0 || oracle.extras !== 0 || Math.abs(oracle.meanOffsetMs) > 0.5))
      verdicts.push({
        key: 'oracle',
        level: 'warn',
        text: `app vs oracle: Δmiss ${oracle.miss}, Δextra ${oracle.extras}, Δoffset ${oracle.meanOffsetMs.toFixed(2)} ms (README tolerance: exact, exact, ±0.5 ms).`,
      })
  } else if (rec.engine?.synth) {
    verdicts.push({
      key: 'truth',
      level: 'warn',
      text: 'synthetic run without session:truth (log older than 2026-09-12): no accuracy block.',
    })
  }
  if (!verdicts.some((v) => v.level !== 'ok'))
    verdicts.unshift({
      key: 'clean',
      level: 'ok',
      text: 'nothing suspicious: the notes table can be read as the drummer.',
    })

  const last = slots[slots.length - 1]
  const eng = rec.engine
  return {
    id: `${rec.device}@${start.at}`,
    device: rec.device,
    exerciseId: String(start.exerciseId),
    bpm: Number(start.bpm),
    startedAt: start.at,
    endedAt: done?.at ?? null,
    complete: done !== null,
    stopped,
    aborted: done?.aborted === true,
    orphan,
    replans: rec.replans,
    t0: first?.t ?? 0,
    durationS: last && first ? last.t + last.dur - first.t : 0,
    options: (start.options as Record<string, unknown> | undefined) ?? {},
    calibration: { latencyMs, slope, r2, deviceLabel: String(rec.calibration?.deviceLabel ?? '') },
    engine: {
      deviceLabel: String(eng?.deviceLabel ?? ''),
      sampleRate: num(eng?.sampleRate),
      outputLatencyMs: num(eng?.outputLatencyMs),
      synth: Boolean(eng?.synth),
      settings: (eng?.settings as Record<string, unknown> | undefined) ?? {},
    },
    stats,
    regrade: { ...counts, matchesApp },
    notes,
    extras,
    clicks,
    outputSeries,
    trust: {
      hits,
      echo,
      echoCandidates,
      echoResidualSdMs,
      countInClicks,
      countInEchoes,
      doubles,
      floor,
      sigmaMs,
      output,
      gaps,
      outputGapIndices,
      notRunning,
      verdicts,
    },
    synthetic,
    markdown: typeof done?.markdown === 'string' ? done.markdown : null,
    feedback: rec.feedback.map(feedbackOf),
  }
}

export type ProcessingKey = (typeof PROCESSING_KEYS)[number]
export type ProcessingState = 'on' | 'off' | 'not reported'

export interface CalibrationRow {
  at: string
  latencyMs: number
  offsetSdMs: number | null
  offsetMinMs: number | null
  offsetMaxMs: number | null
  n: number
  slope: number | null
  r2: number | null
  deviceLabel: string
  /** what the context declares: baseLatency + outputLatency of the engine line in force */
  contextMs: number | null
  /** measured minus declared: the acoustic and unknown part of the path */
  deltaMs: number | null
  /** always the four keys: a browser that never reported one is not the same as one that reported false */
  processing: Record<ProcessingKey, ProcessingState>
}
export interface CalibrationAnalysis {
  device: string
  rows: CalibrationRow[]
  /** σ of the latency across calibrations on the microphone of the last one */
  driftSdMs: number | null
  verdicts: Verdict[]
}

const PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation'] as const
/**
 * Desktop Chrome never reports `voiceIsolation` at all, so a missing one says nothing about the input:
 * it is shown with the rest but is not itself a reason to warn. The other three are reported by every
 * browser that applies them, so a missing one there means nobody checked — as bad as an unknown `on`.
 */
const PROCESSING_MUST_REPORT = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const

export function analyzeCalibrations(lines: LogLine[], device: string): CalibrationAnalysis {
  const rows: CalibrationRow[] = []
  let engine: LogLine | null = null
  let measured: LogLine | null = null
  for (const l of lines) {
    if (l.event === 'engine') engine = l
    else if (l.event === 'calibration:measured') measured = l
    else if (l.event === 'calibration:done') {
      const offsets = ((measured?.offsetsMs as unknown[] | undefined) ?? []).filter(
        (x): x is number => typeof x === 'number',
      )
      const fit = (measured?.fit as { r2?: unknown } | null | undefined) ?? null
      const latencyMs = Number(l.latencyMs)
      const base = num(engine?.baseLatencyMs)
      const out = num(engine?.outputLatencyMs)
      const contextMs = base !== null && out !== null ? base + out : null
      const settings = (engine?.settings as Record<string, unknown> | undefined) ?? {}
      const processing = Object.fromEntries(
        PROCESSING_KEYS.map((k) => [k, settings[k] === true ? 'on' : settings[k] === false ? 'off' : 'not reported']),
      ) as Record<ProcessingKey, ProcessingState>
      rows.push({
        at: l.at,
        latencyMs,
        offsetSdMs: sd(offsets),
        offsetMinMs: offsets.length ? Math.min(...offsets) : null,
        offsetMaxMs: offsets.length ? Math.max(...offsets) : null,
        n: offsets.length,
        slope: num(l.slope),
        r2: num(fit?.r2),
        deviceLabel: String(l.deviceLabel ?? ''),
        contextMs,
        deltaMs: contextMs !== null ? latencyMs - contextMs : null,
        processing,
      })
      measured = null
    }
  }
  const last = rows[rows.length - 1]
  const series = last ? rows.filter((r) => r.deviceLabel === last.deviceLabel).map((r) => r.latencyMs) : []
  const driftSdMs = series.length >= 2 ? sd(series) : null
  const verdicts: Verdict[] = []
  if (last) {
    if (last.offsetSdMs !== null && last.offsetSdMs > 3)
      verdicts.push({
        key: 'repeat',
        level: 'warn',
        text: `the ${last.n} calibration clicks scatter σ ${last.offsetSdMs.toFixed(1)} ms: the echo is not stable.`,
      })
    if (driftSdMs !== null && driftSdMs > 5)
      verdicts.push({
        key: 'drift',
        level: 'warn',
        text: `latency drifts σ ${driftSdMs.toFixed(1)} ms across ${series.length} calibrations on ${last.deviceLabel}.`,
      })
    if (last.slope === null || (last.r2 !== null && last.r2 < 0.9))
      verdicts.push({
        key: 'ramp',
        level: 'warn',
        text: last.slope === null ? 'last calibration saved no slope.' : `last ramp r² ${(last.r2 ?? 0).toFixed(2)}.`,
      })
    if (last.deltaMs !== null && Math.abs(last.deltaMs) > 60)
      verdicts.push({
        key: 'context',
        level: 'warn',
        text: `measured minus declared latency = ${last.deltaMs.toFixed(1)} ms: the context does not know its own output path (Bluetooth? iOS reports 0).`,
      })
    const suspect = PROCESSING_KEYS.filter(
      (k) =>
        last.processing[k] === 'on' ||
        (last.processing[k] === 'not reported' && PROCESSING_MUST_REPORT.some((m) => m === k)),
    )
    if (suspect.length)
      verdicts.push({
        key: 'processing',
        level: 'warn',
        text: `microphone processing ${PROCESSING_KEYS.map((k) => `${k}=${last.processing[k]}`).join(' ')}: ${suspect.join(', ')} not known to be off, and anything the browser does to the input moves the onsets.`,
      })
  } else verdicts.push({ key: 'none', level: 'warn', text: 'no calibration logged for this device.' })
  if (!verdicts.length) verdicts.push({ key: 'clean', level: 'ok', text: 'calibration stable.' })
  return { device, rows, driftSdMs, verdicts }
}

export interface BudgetTerm {
  key: string
  label: string
  ms: number | null
  source: 'fixed' | 'measured'
  note: string
}
export interface Budget {
  terms: BudgetTerm[]
  /** quadrature sum of the known terms */
  totalMs: number | null
  goodMs: number
  okMs: number
}

export function errorBudget(cal: CalibrationAnalysis, sessions: SessionAnalysis[], sampleRate: number | null): Budget {
  const sr = sampleRate ?? 48000
  const block = (128 / sr) * 1000
  const last = cal.rows[cal.rows.length - 1] ?? null
  const outSd = sessions.map((s) => s.trust.output.sd).filter((x): x is number => x !== null)
  const terms: BudgetTerm[] = [
    {
      key: 'block',
      label: 'worklet block (128 samples)',
      ms: block / 2,
      source: 'fixed',
      note: `onsets and calibration offsets are quantised to ${block.toFixed(2)} ms at ${sr} Hz: ± half a block`,
    },
    {
      key: 'hold',
      label: 'detector hold (5 ms)',
      ms: 0,
      source: 'fixed',
      note: 'the same on click and stroke: cancelled by the calibration. The attack difference between click and stroke is the systematic part only a synthetic run or a known pattern reveals.',
    },
    {
      key: 'repeat',
      label: 'calibration repeatability (σ of the offsets)',
      ms: last?.offsetSdMs ?? null,
      source: 'measured',
      note: last ? `last calibration ${last.at}` : 'no calibration logged',
    },
    {
      key: 'drift',
      label: 'calibration drift (σ across calibrations, same microphone)',
      ms: cal.driftSdMs,
      source: 'measured',
      note: `${cal.rows.length} calibrations`,
    },
    {
      key: 'output',
      label: 'output latency jitter in session (mean σ)',
      ms: outSd.length ? mean(outSd) : null,
      source: 'measured',
      note: `${outSd.length} sessions`,
    },
  ]
  const known = terms.map((t) => t.ms).filter((x): x is number => x !== null)
  return {
    terms,
    totalMs: known.length ? Math.sqrt(known.reduce((a, x) => a + x * x, 0)) : null,
    goodMs: DEFAULT_WINDOWS.goodMs,
    okMs: DEFAULT_WINDOWS.okMs,
  }
}
