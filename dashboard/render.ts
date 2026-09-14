// The dashboard's string builders, pure like `svg.ts`: they take an analysis and return HTML, and
// `main.ts` is what assigns it to `innerHTML`. Split out of `main.ts` so the escaping can be tested —
// every value below comes off a log line, and a device key, the weakest credential in the system, is
// enough to write one. Nothing here may interpolate a log-derived value without `esc`.
import type { Budget, CalibrationAnalysis, SessionAnalysis, Verdict } from '../src/analysis/analysis'
import { MAX_FEEDBACK_CHARS } from '../src/telemetry/feedback-text'
import { esc, histogramSvg, offsetsSvg, sparklineSvg, timelineSvg } from './svg'

const fmt = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))
const pct = (n: number, of: number): string => (of ? `${Math.round((100 * n) / of)}%` : '—')
/**
 * `at` is read straight off the log: `"at": 123` used to throw a `TypeError` inside `renderDevice()` and
 * leave the device blank on every load, and a string one reached `innerHTML` unescaped.
 */
const when = (iso: unknown): string => (typeof iso === 'string' ? esc(iso.replace('T', ' ').slice(0, 19)) : '—')
const worst = (vs: Verdict[]): Verdict['level'] =>
  vs.some((v) => v.level === 'bad') ? 'bad' : vs.some((v) => v.level === 'warn') ? 'warn' : 'ok'
const chips = (vs: Verdict[]): string =>
  vs.map((v) => `<span class="chip ${v.level}" title="${esc(v.text)}">${esc(v.key)}: ${esc(v.text)}</span>`).join('')

export function sessionsTable(sessions: SessionAnalysis[], selected: string | null): string {
  if (!sessions.length) return '<p class="small">no session in this log</p>'
  const rows = sessions
    .map(
      (a) => `<tr class="session${a.id === selected ? ' selected' : ''}" data-id="${esc(a.id)}">
      <td class="left">${when(a.startedAt)}</td><td class="left">${esc(a.exerciseId)}</td><td>${a.bpm}</td>
      <td>${a.regrade.good}/${a.regrade.ok}/${a.regrade.off}/${a.regrade.miss}+${a.regrade.extras}</td>
      <td>${pct(a.trust.echo, a.trust.hits)}</td><td>${a.trust.doubles}</td><td>${fmt(a.trust.sigmaMs, 2)}</td>
      <td class="left"><span class="chip ${worst(a.trust.verdicts)}">${worst(a.trust.verdicts)}</span></td>
      <td>${fmt(a.calibration.latencyMs)} · ${fmt(a.calibration.slope, 2)} · ${fmt(a.calibration.r2, 3)}</td>
      <td class="left">${[a.complete ? '' : 'incomplete', a.orphan ? 'orphan' : '', a.stopped ? 'stopped' : '', a.synthetic ? 'synthetic' : a.engine.synth ? 'synthetic (no truth)' : '', a.feedback.length ? 'feedback' : ''].filter(Boolean).join(' · ')}</td>
    </tr>`,
    )
    .join('')
  return `<table><thead><tr><th class="left">when</th><th class="left">exercise</th><th>bpm</th><th>good/ok/off/miss+extra</th><th>echo</th><th>doubles</th><th>σ ms</th><th class="left">verdict</th><th>calibration ms · slope · r²</th><th class="left">flags</th></tr></thead><tbody>${rows}</tbody></table>`
}

export function detail(a: SessionAnalysis, pxPerSec: number): string {
  const o = a.options
  const opts = [
    // `analyzeSession` narrows `options` to a number and three booleans; escaped here too, because this
    // is the site that reaches `innerHTML` and it must be safe on whatever it is handed.
    `clicks ${esc(String(o.metronome?.clickSubdivision ?? 1))}`,
    o.metronome?.guide ? 'guide' : '',
    o.metronome?.gap ? 'gap' : '',
    o.autoIncrement ? 'auto' : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const offsets = (hand: 'R' | 'L'): number[] =>
    a.notes.filter((n) => n.hand === hand && n.offsetMs !== null).map((n) => n.offsetMs as number)
  const levels = a.notes.filter((n) => n.peakDb !== null).map((n) => n.peakDb as number)
  const notesRows = a.notes
    .map(
      (n) =>
        `<tr><td>${n.i}</td><td>${n.bar}.${n.beat}.${n.sub}</td><td>${esc(n.hand)}${n.accent ? ' >' : ''}</td><td>${n.t.toFixed(3)}</td><td>${n.hitT === null ? '—' : n.hitT.toFixed(3)}</td><td>${fmt(n.offsetMs)}</td><td>${fmt(n.peakDb)}</td><td class="left">${n.grade}</td><td class="left">${n.flags.join(' ')}</td></tr>`,
    )
    .join('')
  const extrasRows = a.extras
    .map(
      (e) =>
        `<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>${e.t.toFixed(3)}</td><td>—</td><td>${e.peakDb.toFixed(1)}</td><td class="left">extra</td><td class="left">${e.flags.join(' ')}</td></tr>`,
    )
    .join('')
  const synth = a.synthetic
    ? `<h3>Synthetic accuracy</h3><p>${esc(a.synthetic.preset)} · seed ${a.synthetic.seed} · detected <b>${a.synthetic.detected}/${a.synthetic.strokes}</b> · missed ${a.synthetic.missed} · false ${a.synthetic.falseHits}<br/>timing ${fmt(a.synthetic.timingMs.mean, 2)} ± ${fmt(a.synthetic.timingMs.sd, 2)} ms (max ${fmt(a.synthetic.timingMs.max, 2)}) · level ${fmt(a.synthetic.levelDb.mean, 2)} ± ${fmt(a.synthetic.levelDb.sd, 2)} dB${a.synthetic.oracle ? `<br/>app vs oracle: Δmiss ${a.synthetic.oracle.miss} · Δextra ${a.synthetic.oracle.extras} · Δoffset ${a.synthetic.oracle.meanOffsetMs.toFixed(2)} ms (tolerance: exact, exact, ±0.5)` : ''}</p>`
    : ''
  const errors = a.trust.verdicts.find((v) => v.key === 'errors')
  const feedback = a.feedback.length
    ? `<ul class="feedback">${a.feedback
        .map((f) => `<li><span class="small">${when(f.at)} · ${esc(f.source)}</span><br/>${esc(f.text)}</li>`)
        .join('')}</ul>`
    : '<p class="small">no comment on this session yet</p>'
  return `
    <h2>${esc(a.device)} · ${esc(a.exerciseId)} @ ${a.bpm} bpm · ${when(a.startedAt)}</h2>
    <p class="small">mic ${esc(a.engine.deviceLabel || '—')} · ${a.engine.sampleRate ?? '—'} Hz · declared output ${fmt(a.engine.outputLatencyMs)} ms · calibration ${fmt(a.calibration.latencyMs)} ms · slope ${fmt(a.calibration.slope, 2)} · r² ${fmt(a.calibration.r2, 4)} · ${opts} · ${a.durationS.toFixed(0)} s · replans ${a.replans}${a.stopped ? ' · stopped' : ''}${a.complete ? '' : ' · INCOMPLETE'}</p>
    <div>${chips(a.trust.verdicts)}</div>
    <p>notes: good <b>${a.regrade.good}</b> · ok ${a.regrade.ok} · off ${a.regrade.off} · miss ${a.regrade.miss} · extra ${a.regrade.extras} · absorbed ${a.regrade.absorbed}${a.regrade.matchesApp === null ? '' : a.regrade.matchesApp ? ' · matches the app' : ' · <b>differs from the app</b>'}<br/>hits ${a.trust.hits} · echo ${a.trust.echo}/${a.trust.echoCandidates} candidates (residual σ ${fmt(a.trust.echoResidualSdMs, 2)} ms · count-in ${a.trust.countInEchoes}/${a.trust.countInClicks}) · doubles ${a.trust.doubles} · floor ${a.trust.floor} · σ offset ${fmt(a.trust.sigmaMs, 2)} ms · output ${fmt(a.trust.output.mean)} ± ${fmt(a.trust.output.sd)} ms (max ${fmt(a.trust.output.max)}) · gaps ${a.trust.gaps}</p>
    <div class="row"><label>zoom <input id="zoom" type="range" min="20" max="240" value="${pxPerSec}" /> <span id="zoomv">${pxPerSec} px/s</span></label></div>
    <div class="scroll" id="timeline">${timelineSvg(a, pxPerSec)}${offsetsSvg(a, pxPerSec)}</div>
    <div class="grid">
      <div><h3>Offset per hand (ms, 5 ms bins)</h3>${histogramSvg(
        [
          { label: 'R', values: offsets('R') },
          { label: 'L', values: offsets('L') },
        ],
        -60,
        60,
        5,
        { bands: [-40, -20, 20, 40] },
      )}</div>
      <div><h3>Level (dB, 3 dB bins)</h3>${histogramSvg([{ label: 'all', values: levels }], -45, 0, 3, { bands: [-40] })}</div>
      <div><h3>Output latency (ms, one sample per second; dashed = gap > 2.5 s)</h3>${sparklineSvg(
        a.outputSeries.map((o) => o.ms),
        600,
        60,
        a.trust.outputGapIndices,
      )}</div>
    </div>
    ${synth}
    ${errors ? `<h3>Errors</h3><p>${esc(errors.text)}</p>` : ''}
    <h3>Feedback</h3>
    ${feedback}
    <textarea id="feedback-text" rows="3" maxlength="${MAX_FEEDBACK_CHARS}" placeholder="What felt right or wrong: missed strokes, wrong grades, latency, anything."></textarea>
    <div class="row"><button id="feedback-save" type="button">Save</button><span id="feedback-status" class="small"></span></div>
    <details><summary>Notes (${a.notes.length}) and extras (${a.extras.length})</summary>
      <table><thead><tr><th>#</th><th>bar.beat.sub</th><th>hand</th><th>expected s</th><th>hit s</th><th>offset ms</th><th>dB</th><th class="left">grade</th><th class="left">flags</th></tr></thead><tbody>${notesRows}${extrasRows}</tbody></table>
    </details>
    ${a.markdown ? `<details><summary>App report</summary><pre>${esc(a.markdown)}</pre></details>` : ''}
  `
}

export function calibrationPanel(cal: CalibrationAnalysis, budget: Budget): string {
  const rows = cal.rows
    .map(
      (r) =>
        `<tr><td class="left">${when(r.at)}</td><td>${fmt(r.latencyMs)}</td><td>${fmt(r.offsetSdMs, 2)} / ${fmt(r.offsetMinMs)} / ${fmt(r.offsetMaxMs)}</td><td>${r.n}</td><td>${fmt(r.slope, 2)}</td><td>${fmt(r.r2, 4)}</td><td>${fmt(r.contextMs)}</td><td>${fmt(r.deltaMs)}</td><td class="left">${esc(r.deviceLabel)}</td><td class="left">${esc(
          Object.entries(r.processing)
            .map(([k, state]) => `${k}=${state}`)
            .join(' '),
        )}</td></tr>`,
    )
    .join('')
  const terms = budget.terms
    .map(
      (t) =>
        `<tr><td class="left">${esc(t.label)}</td><td>${t.ms === null ? '—' : `±${t.ms.toFixed(2)}`}</td><td class="left">${t.source}</td><td class="left small">${esc(t.note)}</td></tr>`,
    )
    .join('')
  return `
    <div>${chips(cal.verdicts)}</div>
    <p class="small">${cal.rows.length} calibrations · drift σ ${fmt(cal.driftSdMs)} ms (same microphone as the last one)</p>
    ${sparklineSvg(cal.rows.map((r) => r.latencyMs))}
    <table><thead><tr><th class="left">when</th><th>latency ms</th><th>σ / min / max of offsets</th><th>n</th><th>slope</th><th>r²</th><th>declared ms</th><th>Δ ms</th><th class="left">mic</th><th class="left">processing</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Error budget</h3>
    <table><thead><tr><th class="left">term</th><th>ms</th><th class="left">source</th><th class="left">why</th></tr></thead><tbody>${terms}</tbody></table>
    <p>expected timing uncertainty (quadrature): <b>${budget.totalMs === null ? '—' : `±${budget.totalMs.toFixed(1)} ms`}</b> · judge windows good ±${budget.goodMs} ms · ok ±${budget.okMs} ms</p>
  `
}
