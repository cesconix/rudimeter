// Plain-text views of the analysis for the terminal. Numbers only; the dashboard draws.
import type { Budget, CalibrationAnalysis, SessionAnalysis, Verdict } from './analysis'
import type { FeedbackEntry } from './feedback'

const ms = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))
const pct = (n: number, of: number): string => (of ? `${Math.round((100 * n) / of)}%` : '—')
const worst = (vs: Verdict[]): string =>
  vs.some((v) => v.level === 'bad') ? 'bad' : vs.some((v) => v.level === 'warn') ? 'warn' : 'ok'
const counts = (a: SessionAnalysis): string =>
  `${a.regrade.good}/${a.regrade.ok}/${a.regrade.off}/${a.regrade.miss}+${a.regrade.extras}`
const when = (iso: string): string => iso.replace('T', ' ').slice(0, 19)
/** minutes are enough for a comment's time: `2026-09-12 06:24` */
const stamp = (iso: string): string => iso.replace('T', ' ').slice(0, 16)
const nonOk = (vs: Verdict[]): string =>
  vs
    .filter((v) => v.level !== 'ok')
    .map((v) => v.key)
    .join(', ') || '—'
/** The session in one line for a comment to sit under: when · device · exercise @ bpm · counts · worst · non-ok keys. */
const summaryLine = (a: SessionAnalysis): string =>
  `${when(a.startedAt)} · ${a.device} · ${a.exerciseId} @ ${a.bpm} · ${counts(a)} · ${worst(a.trust.verdicts)} · ${nonOk(a.trust.verdicts)}`
/** Continuation lines of a multi-line comment indented under the first, by `pad`. */
const indent = (text: string, pad: string): string => text.split('\n').join(`\n${pad}`)

export function formatTable(sessions: SessionAnalysis[]): string {
  const rows = [
    ['when', 'device', 'exercise', 'bpm', 'good/ok/off/miss+extra', 'echo', 'doubles', 'σ ms', 'verdict', 'flags'],
  ]
  for (const a of sessions) {
    const flags = [
      a.complete ? '' : 'incomplete',
      a.orphan ? 'orphan' : '',
      a.stopped ? 'stopped' : '',
      a.synthetic ? 'synthetic' : '',
      a.feedback.length ? 'feedback' : '',
    ]
      .filter(Boolean)
      .join(' ')
    rows.push([
      when(a.startedAt),
      a.device,
      a.exerciseId,
      String(a.bpm),
      counts(a),
      `echo ${pct(a.trust.echo, a.trust.hits)}`,
      String(a.trust.doubles),
      ms(a.trust.sigmaMs, 2),
      worst(a.trust.verdicts),
      flags,
    ])
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)))
  return `${rows
    .map((r) =>
      r
        .map((cell, c) => cell.padEnd(widths[c]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')}\n`
}

export function formatVerdict(a: SessionAnalysis): string {
  const out: string[] = []
  out.push(
    `${a.device} · ${a.exerciseId} @ ${a.bpm} bpm · ${a.startedAt}${a.complete ? '' : ' · INCOMPLETE'}${a.stopped ? ' · stopped' : ''}`,
  )
  out.push(
    `mic ${a.engine.deviceLabel || '—'} · ${a.engine.sampleRate ?? '—'} Hz · output ${ms(a.engine.outputLatencyMs)} ms · calibration ${ms(a.calibration.latencyMs)} ms · slope ${ms(a.calibration.slope, 2)} · r² ${ms(a.calibration.r2, 4)}`,
  )
  out.push('')
  for (const v of a.trust.verdicts) out.push(`[${v.level}] ${v.key}: ${v.text}`)
  out.push('')
  out.push(
    `notes: good ${a.regrade.good} · ok ${a.regrade.ok} · off ${a.regrade.off} · miss ${a.regrade.miss} · extra ${a.regrade.extras} · absorbed ${a.regrade.absorbed}` +
      (a.regrade.matchesApp === null ? '' : a.regrade.matchesApp ? ' · matches the app' : ' · DIFFERS from the app'),
  )
  out.push(
    `hits ${a.trust.hits} · echo ${a.trust.echo}/${a.trust.echoCandidates} candidates (residual σ ${ms(a.trust.echoResidualSdMs, 2)} ms · count-in ${a.trust.countInEchoes}/${a.trust.countInClicks}) · doubles ${a.trust.doubles} · floor ${a.trust.floor} · σ offset ${ms(a.trust.sigmaMs, 2)} ms · output ${ms(a.trust.output.mean)} ± ${ms(a.trust.output.sd)} ms (max ${ms(a.trust.output.max)}) · gaps ${a.trust.gaps}`,
  )
  if (a.synthetic) {
    const s = a.synthetic
    out.push('')
    out.push(
      `synthetic ${s.preset} seed ${s.seed}: detected ${s.detected}/${s.strokes} · missed ${s.missed} · false ${s.falseHits}`,
    )
    out.push(
      `timing ${ms(s.timingMs.mean, 2)} ± ${ms(s.timingMs.sd, 2)} ms (max ${ms(s.timingMs.max, 2)}) · level ${ms(s.levelDb.mean, 2)} ± ${ms(s.levelDb.sd, 2)} dB`,
    )
    if (s.oracle)
      out.push(
        `app vs oracle: Δmiss ${s.oracle.miss} · Δextra ${s.oracle.extras} · Δoffset ${s.oracle.meanOffsetMs.toFixed(2)} ms`,
      )
  }
  if (a.feedback.length) {
    out.push('')
    out.push('feedback:')
    for (const f of a.feedback) out.push(`[${f.source} ${stamp(f.at)}] ${indent(f.text, '  ')}`)
  }
  return `${out.join('\n')}\n`
}

export function formatCalibrations(cal: CalibrationAnalysis, budget: Budget): string {
  const out: string[] = []
  out.push(`${cal.device}: ${cal.rows.length} calibrations · drift σ ${ms(cal.driftSdMs)} ms`)
  for (const v of cal.verdicts) out.push(`[${v.level}] ${v.key}: ${v.text}`)
  out.push('')
  out.push('when                 latency  σ/min/max of offsets   slope  r²      Δ context  mic')
  for (const r of cal.rows) {
    // The left half is padded as a whole to column 51, so the columns line up whatever the widths of
    // the three offset numbers add up to.
    const left = `${r.at.replace('T', ' ').slice(0, 19)}  ${ms(r.latencyMs).padStart(7)}  ${ms(r.offsetSdMs, 2)}/${ms(r.offsetMinMs)}/${ms(r.offsetMaxMs)}`
    out.push(
      `${left.padEnd(51)}${ms(r.slope, 2).padStart(5)}  ${ms(r.r2, 4).padStart(6)}  ${ms(r.deltaMs).padStart(9)}  ${r.deviceLabel}`,
    )
  }
  out.push('')
  out.push('error budget:')
  for (const t of budget.terms)
    out.push(`  ${t.label}: ${t.ms === null ? '—' : `±${t.ms.toFixed(1)} ms`} (${t.source}) ${t.note}`)
  out.push(
    `  total (quadrature): ${budget.totalMs === null ? '—' : `±${budget.totalMs.toFixed(1)} ms`} · windows good ±${budget.goodMs} · ok ±${budget.okMs}`,
  )
  return `${out.join('\n')}\n`
}

export function formatFeedback(entries: FeedbackEntry[]): string {
  if (!entries.length) return 'no feedback yet\n'
  const out: string[] = []
  for (const e of entries) {
    out.push(e.session ? summaryLine(e.session) : `${when(e.at)} · ${e.device} · session not found`)
    out.push(`  [${e.source} ${stamp(e.at)}] ${indent(e.text, '    ')}`)
    out.push('')
  }
  return `${out.join('\n')}\n`
}

/** The same list as Markdown, for the archive outside `.remote/` (`bun run remote feedback --export`). */
export function formatFeedbackMarkdown(entries: FeedbackEntry[], exportedAt: string): string {
  const out = ['# Session feedback', '', `Exported ${exportedAt} · newest first · ${entries.length} comments`, '']
  for (const e of entries) {
    const s = e.session
    if (s) {
      out.push(`## ${stamp(s.startedAt)} · ${s.device} · ${s.exerciseId} @ ${s.bpm}`, '')
      out.push('| notes | verdict | flags | calibration | echo | σ ms |', '|---|---|---|---|---|---|')
      out.push(
        `| ${counts(s)} | ${worst(s.trust.verdicts)} | ${nonOk(s.trust.verdicts)} | ${ms(s.calibration.latencyMs)} ms · slope ${ms(s.calibration.slope, 2)} · r² ${ms(s.calibration.r2, 4)} | ${pct(s.trust.echo, s.trust.hits)} | ${ms(s.trust.sigmaMs, 2)} |`,
        '',
      )
    } else out.push(`## ${stamp(e.at)} · ${e.device} · session not found`, '')
    out.push(`**${e.source} · ${stamp(e.at)}**`, '', `> ${indent(e.text, '> ')}`, '')
  }
  return `${out.join('\n')}\n`
}
