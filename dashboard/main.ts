// The session dashboard: every device's lines read from `/api/lines` — the dev server's SQLite under Vite,
// the production store on rudimeter.com/dashboard/ — analysed here in the page with src/analysis, and
// polled by `seq` so a session shows up while it is being played. The API only stores lines.
import { type LogLine, parseLines, type SessionAnalysis } from '../src/analysis/analysis'
import { type DeviceReport, deviceReportFromLines } from '../src/analysis/device-report'
import { EXERCISES } from '../src/data/exercises'
import { cleanFeedback } from '../src/telemetry/feedback-text'
import { createPoller } from './poller'
import { calibrationPanel, detail, sessionsTable } from './render'
import { saveFeedback } from './save-feedback'
import { esc, offsetsSvg, timelineSvg } from './svg'

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
/**
 * One `/api/lines` page. Kept at the API's own `MAX_LIMIT` (2000 rows ≈ 400–900 KB, under Vercel's 4.5
 * MB response cap); a device with a day of `hit` lines takes a few pages, and the poller keeps asking
 * until one comes back empty, so this number is a round-trip cost, never a limit on what is read.
 */
const PAGE = 2000

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
let selected: string | null = null
let pxPerSec = 60

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

async function fetchLines(name: string, since: number): Promise<LogLine[]> {
  const res = await api(`/api/lines?device=${encodeURIComponent(name)}&since=${since}&limit=${PAGE}`)
  return parseLines(await res.text())
}

/**
 * Holds every device's lines and pulls new ones by `seq`, one request in flight per device — see
 * `poller.ts` for why that also keeps an out-of-order or superseded response from rolling the view back.
 */
const poller = createPoller(fetchLines)

function current(): DeviceReport | undefined {
  const name = deviceSel.value
  return name ? deviceReportFromLines(name, poller.held(name), deps, 50) : undefined
}

function setStatus(): void {
  const bytes = devices.reduce((n, d) => n + d.bytes, 0)
  const lines = poller.held(deviceSel.value).length
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
  const name = deviceSel.value
  const changed = await poller.pull(name)
  // A poll that outlives a device switch answers a question nobody is asking anymore: drop it.
  if (deviceSel.value !== name) return
  setStatus()
  if (changed && !drafting()) renderDevice()
}

async function boot(): Promise<void> {
  status.textContent = 'loading…'
  await refreshDevices()
  loginBox.hidden = true
  mainBox.hidden = false
  if (deviceSel.value) await poller.pull(deviceSel.value)
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
  sessionsBox.innerHTML = sessionsTable(r.sessions, selected)
  for (const row of sessionsBox.querySelectorAll<HTMLTableRowElement>('tr.session'))
    row.addEventListener('click', () => {
      selected = row.dataset.id ?? null
      renderDevice()
    })
  const a = r.sessions.find((s) => s.id === selected) ?? r.sessions[0]
  selected = a?.id ?? null
  detailBox.innerHTML = a ? detail(a, pxPerSec) : ''
  if (a) wireDetail(a)
  calibrationBox.innerHTML = calibrationPanel(r.calibrations, r.budget)
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
        const outcome = await saveFeedback(
          () =>
            fetch('/api/feedback', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ device: a.device, sessionId: a.id, text: clean }),
            }),
          () => poller.pull(a.device),
        )
        if (!outcome.ok) {
          if (outcome.unauthorized) showLogin()
          fstatus.textContent = `save failed: ${outcome.message}`
          save.disabled = false
          return
        }
        // Saved: clear the box and re-render regardless of whether the refresh inside saveFeedback
        // landed — the store already has the comment, so a refresh problem is a stale view, not this.
        text.value = ''
        renderDevice()
      } catch (err) {
        // The POST itself never completed (e.g. the network dropped): saveFeedback swallows a refresh
        // failure internally, so only a save that truly never got a response reaches this catch.
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

deviceSel.addEventListener('change', () => {
  selected = null
  poller
    .pull(deviceSel.value)
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
