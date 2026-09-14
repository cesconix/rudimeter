// The session dashboard: every device's lines read from `/api/lines` — the dev server's SQLite under Vite,
// the production store on rudimeter.com/dashboard/ — analysed here in the page with src/analysis, and
// polled by `seq` so a session shows up while it is being played. The API only stores lines.
import {
  type Budget,
  type CalibrationAnalysis,
  type LogLine,
  parseLines,
  type SessionAnalysis,
  type Verdict,
} from '../src/analysis/analysis'
import { type DeviceReport, deviceReportFromLines } from '../src/analysis/device-report'
import { EXERCISES } from '../src/data/exercises'
import { cleanFeedback, MAX_FEEDBACK_CHARS } from '../src/telemetry/feedback-text'
import { mergeLines } from './merge-lines'
import { esc, histogramSvg, offsetsSvg, sparklineSvg, timelineSvg } from './svg'

interface DeviceSummary {
  id: string
  name: string
  lastSeq: number
  lastAt: string | null
  lines: number
  bytes: number
}

/** 3 s: a session's notes appear while it is played; the store answers a `since` poll with nothing in a few ms. */
const LINES_MS = 3000
const DEVICES_MS = 10000
/** One `/api/lines` page; a device with a day of `hit` lines takes a few. */
const PAGE = 20000

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`#${id} missing`)
  return node as T
}
const deviceSel = el<HTMLSelectElement>('device')
const status = el<HTMLSpanElement>('status')
const sessionsBox = el<HTMLDivElement>('sessions')
const detailBox = el<HTMLDivElement>('detail')
const calibrationBox = el<HTMLDivElement>('calibration')
const loginBox = el<HTMLDivElement>('login')
const tokenInput = el<HTMLInputElement>('token')
const mainBox = el<HTMLDivElement>('main')

const deps = { exerciseById: (id: string) => EXERCISES.find((e) => e.id === id) }
let devices: DeviceSummary[] = []
/** Every line held per device name, in seq order: the analysis runs on these at each render. */
const logs = new Map<string, LogLine[]>()
let selected: string | null = null
let pxPerSec = 60

const fmt = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))
const pct = (n: number, of: number): string => (of ? `${Math.round((100 * n) / of)}%` : '—')
const when = (iso: string): string => iso.replace('T', ' ').slice(0, 19)
const worst = (vs: Verdict[]): Verdict['level'] =>
  vs.some((v) => v.level === 'bad') ? 'bad' : vs.some((v) => v.level === 'warn') ? 'warn' : 'ok'
const chips = (vs: Verdict[]): string =>
  vs.map((v) => `<span class="chip ${v.level}" title="${esc(v.text)}">${esc(v.key)}: ${esc(v.text)}</span>`).join('')

class Unauthorized extends Error {}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init)
  if (res.status === 401) throw new Unauthorized('token required')
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `server said ${res.status}`)
  }
  return res
}

async function refreshDevices(): Promise<void> {
  devices = (await (await api('/api/devices')).json()) as DeviceSummary[]
  const names = devices.map((d) => d.name)
  const current = deviceSel.value
  deviceSel.innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
  deviceSel.value = names.includes(current) ? current : (names[0] ?? '')
}

/** Lines past the last held one; true when something new arrived. A full page may not be the end. */
async function pull(name: string): Promise<boolean> {
  const held = logs.get(name) ?? []
  const since = held.length ? held[held.length - 1].seq : 0
  const res = await api(`/api/lines?device=${encodeURIComponent(name)}&since=${since}&limit=${PAGE}`)
  const added = parseLines(await res.text())
  if (!added.length) return false
  logs.set(name, mergeLines(held, added))
  if (added.length >= PAGE) await pull(name)
  return true
}

function current(): DeviceReport | undefined {
  const name = deviceSel.value
  return name ? deviceReportFromLines(name, logs.get(name) ?? [], deps, 50) : undefined
}

function setStatus(): void {
  const bytes = devices.reduce((n, d) => n + d.bytes, 0)
  const lines = (logs.get(deviceSel.value) ?? []).length
  status.textContent = `live · ${new Date().toLocaleTimeString()} · ${lines} lines · storage ${(bytes / 1048576).toFixed(1)} MB`
}

/** A comment being typed must not be wiped by a re-render: hold the render until it is saved or cleared. */
function drafting(): boolean {
  const t = detailBox.querySelector<HTMLTextAreaElement>('#feedback-text')
  return t !== null && (t.value.trim() !== '' || document.activeElement === t)
}

function fail(err: unknown): void {
  if (err instanceof Unauthorized) {
    showLogin()
    return
  }
  status.textContent = `failed: ${(err as Error).message}`
}

function showLogin(): void {
  loginBox.hidden = false
  mainBox.hidden = true
  tokenInput.focus()
}

async function tick(): Promise<void> {
  if (document.hidden || !deviceSel.value) return
  const changed = await pull(deviceSel.value)
  setStatus()
  if (changed && !drafting()) renderDevice()
}

async function boot(): Promise<void> {
  status.textContent = 'loading…'
  await refreshDevices()
  loginBox.hidden = true
  mainBox.hidden = false
  if (deviceSel.value) await pull(deviceSel.value)
  setStatus()
  renderDevice()
}

function renderDevice(): void {
  const r = current()
  if (!r) {
    sessionsBox.innerHTML = '<p class="small">no line for this device yet</p>'
    detailBox.innerHTML = ''
    calibrationBox.innerHTML = ''
    return
  }
  sessionsBox.innerHTML = sessionsTable(r.sessions)
  for (const row of sessionsBox.querySelectorAll<HTMLTableRowElement>('tr.session'))
    row.addEventListener('click', () => {
      selected = row.dataset.id ?? null
      renderDevice()
    })
  const a = r.sessions.find((s) => s.id === selected) ?? r.sessions[0]
  selected = a?.id ?? null
  detailBox.innerHTML = a ? detail(a) : ''
  if (a) wireDetail(a)
  calibrationBox.innerHTML = calibrationPanel(r.calibrations, r.budget)
}

function sessionsTable(sessions: SessionAnalysis[]): string {
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

function detail(a: SessionAnalysis): string {
  const o = a.options as {
    metronome?: { clickSubdivision?: number; guide?: boolean; gap?: unknown }
    autoIncrement?: unknown
  }
  const opts = [
    `clicks ${o.metronome?.clickSubdivision ?? 1}`,
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
        `<tr><td>${n.i}</td><td>${n.bar}.${n.beat}.${n.sub}</td><td>${n.hand}${n.accent ? ' >' : ''}</td><td>${n.t.toFixed(3)}</td><td>${n.hitT === null ? '—' : n.hitT.toFixed(3)}</td><td>${fmt(n.offsetMs)}</td><td>${fmt(n.peakDb)}</td><td class="left">${n.grade}</td><td class="left">${n.flags.join(' ')}</td></tr>`,
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

function wireDetail(a: SessionAnalysis): void {
  const text = detailBox.querySelector<HTMLTextAreaElement>('#feedback-text')
  const save = detailBox.querySelector<HTMLButtonElement>('#feedback-save')
  const fstatus = detailBox.querySelector<HTMLSpanElement>('#feedback-status')
  if (text && save && fstatus)
    save.addEventListener('click', async () => {
      const clean = cleanFeedback(text.value)
      if (clean === null) {
        fstatus.textContent = 'nothing to save'
        return
      }
      save.disabled = true
      fstatus.textContent = 'saving…'
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ device: a.device, sessionId: a.id, text: clean }),
        })
        if (res.status === 401) throw new Unauthorized('token required')
        if (!res.ok) {
          const { error } = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(error ?? `server said ${res.status}`)
        }
        // Pull rather than patch the DOM: the store is the truth, and the render keeps the selection.
        text.value = ''
        await pull(a.device)
        renderDevice()
      } catch (err) {
        if (err instanceof Unauthorized) showLogin()
        fstatus.textContent = `save failed: ${(err as Error).message}`
        save.disabled = false
      }
    })
  const zoom = detailBox.querySelector<HTMLInputElement>('#zoom')
  const zoomv = detailBox.querySelector<HTMLSpanElement>('#zoomv')
  const box = detailBox.querySelector<HTMLDivElement>('#timeline')
  if (!zoom || !zoomv || !box) return
  zoom.addEventListener('input', () => {
    pxPerSec = Number(zoom.value)
    zoomv.textContent = `${pxPerSec} px/s`
    box.innerHTML = timelineSvg(a, pxPerSec) + offsetsSvg(a, pxPerSec)
  })
}

function calibrationPanel(cal: CalibrationAnalysis, budget: Budget): string {
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

deviceSel.addEventListener('change', () => {
  selected = null
  pull(deviceSel.value)
    .then(() => {
      setStatus()
      renderDevice()
    })
    .catch(fail)
})
el<HTMLButtonElement>('refresh').addEventListener('click', () => boot().catch(fail))
el<HTMLFormElement>('login-form').addEventListener('submit', (e) => {
  e.preventDefault()
  api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: tokenInput.value }),
  })
    .then(() => {
      tokenInput.value = ''
      return boot()
    })
    .catch((err: unknown) => {
      status.textContent = err instanceof Unauthorized ? 'wrong token' : `login failed: ${(err as Error).message}`
      showLogin()
    })
})
el<HTMLButtonElement>('logout').addEventListener('click', () => {
  fetch('/api/logout', { method: 'POST' }).then(showLogin, fail)
})
window.setInterval(() => tick().catch(fail), LINES_MS)
window.setInterval(() => {
  if (!document.hidden) refreshDevices().then(setStatus).catch(fail)
}, DEVICES_MS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick().catch(fail)
})
boot().catch(fail)
