// Dev page: the audio lab. Replaces the two throwaway spike pages (public/spike.html,
// public/listen.html) with typed code on the remote channel, so the whole run can be driven from the
// Mac with `bun run remote` while the device that matters — the iPhone, speaker out loud — sits on the
// practice pad.
//
// The question the page answers: which click can the speaker play without the onset detector hearing
// its own echo? The matrix plays 8 clicks per candidate sound while the analysis path is filtered
// (three biquads between the microphone and the node Capture listens to) and counts how many came
// back, how late, and how loud.

import { Capture, DEFAULT_THRESHOLDS } from '../src/audio/capture'
import { audibleTime } from '../src/audio/clock'
import { createAudioContext, ensureRunning } from '../src/audio/context'
import type { Remote } from '../src/dev/remote'
import { remoteNameFrom } from '../src/dev/remote-name'
import { type Filter, matrixCell, PRESETS, parseFilter, SOUNDS, type Sound } from './lab-sounds'

/** 68 ms delay instead of speaker + mic, silent: the logic of a run can be checked without a room. */
const LOOP = new URLSearchParams(location.search).has('loop')
const N = 8
const SPACING = 0.4
/**
 * Section Qs of a 6th-order Butterworth split over three biquads: 36 dB/oct with a flat passband.
 * The middle section is exactly 1/√2 (the spike pages wrote it rounded, as 0.7071).
 */
const BUTTERWORTH_QS = [0.5176, Math.SQRT1_2, 1.9319]
/** 120 bpm, the live metronome's period in seconds. */
const METRO_SPACING = 0.5
const RECORD_SECONDS = 10

let ctx: AudioContext | null = null
let capture: Capture | null = null
let bus: GainNode | null = null // everything the lab plays
let source: AudioNode | null = null // microphone (or the loop delay)
let analysis: GainNode | null = null // what Capture listens to; the filter chain sits between source and this
let chain: BiquadFilterNode[] = []
const onsets: { t: number; peak: number }[] = []
let onOnset: ((o: { t: number; peak: number }) => void) | null = null
let remote: Remote | null = null
let label = 'loop'
let bgDb = -120

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  // A missing id means dev/lab.html and this file drifted apart: it must break loudly, not silently.
  if (!found) throw new Error(`dev/lab.html has no #${id}`)
  return found as T
}

const statusEl = el<HTMLParagraphElement>('status')
const tableEl = el<HTMLTableElement>('out')
const logEl = el<HTMLPreElement>('log')

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -120)
const colName = (c: Filter): string => (c.kind === 'off' ? 'off' : `${c.kind} ${c.f}`)

function setStatus(text: string): void {
  statusEl.classList.remove('say')
  statusEl.textContent = text
}

/** `say` over the channel: big text, so it is readable on a device lying on the pad, at arm's length. */
function say(text: string, seconds: number): void {
  statusEl.textContent = text
  statusEl.classList.add('say')
  window.setTimeout(() => {
    if (statusEl.textContent === text) setStatus('')
  }, seconds * 1000)
}

/** What the OS says the output path costs right now (what Meter.tsx shows as `output N ms`). */
function outputInfo(c: AudioContext): string {
  // 0 ms means "the device has not rendered a block yet", not "no latency": audibleTime falls back
  // to the scheduling clock while it does not know (Safari has no getOutputTimestamp at all).
  const live = ((c.currentTime - audibleTime(c)) * 1000).toFixed(0)
  const base = typeof c.baseLatency === 'number' ? (c.baseLatency * 1000).toFixed(0) : '?'
  const out = typeof c.outputLatency === 'number' ? (c.outputLatency * 1000).toFixed(0) : '?'
  return `output ${live} ms (base ${base}, outputLatency ${out})`
}

function enabled(): { ctx: AudioContext; bus: GainNode; source: AudioNode; analysis: GainNode } {
  if (!ctx || !bus || !source || !analysis) throw new Error('not enabled: tap Enable on the device first')
  return { ctx, bus, source, analysis }
}

function soundFor(id: string): Sound {
  const sound = SOUNDS[id]
  if (!sound) throw new Error(`unknown sound "${id}"; ids: ${Object.keys(SOUNDS).join(', ')}`)
  return sound
}

/** Rebuilds the analysis chain between the raw input and the node Capture listens to. */
function setFilter(f: Filter): void {
  const { ctx: c, source: src, analysis: out } = enabled()
  // `disconnect()` with no argument drops every edge leaving the source, a live record tap included:
  // the filter must not be changed while a recording is running.
  src.disconnect()
  for (const b of chain) b.disconnect()
  chain = []
  let node: AudioNode = src
  if (f.kind !== 'off') {
    for (const q of BUTTERWORTH_QS) {
      const b = c.createBiquadFilter()
      b.type = f.kind === 'lp' ? 'lowpass' : 'highpass'
      b.frequency.value = f.f
      b.Q.value = q
      node.connect(b)
      chain.push(b)
      node = b
    }
  }
  node.connect(out)
}

/** Opens the audio graph. On iOS this is the one tap the page needs: everything else runs from the channel. */
async function enable(): Promise<string> {
  if (ctx) return 'already enabled'
  const enableBtn = el<HTMLButtonElement>('enable')
  enableBtn.disabled = true
  try {
    const c = createAudioContext()
    await ensureRunning(c)
    ctx = c
    bus = c.createGain()
    analysis = c.createGain()
    if (LOOP) {
      // 68 ms is the round trip the spike measured on the Mac's own speaker and microphone: the same
      // figure comes back out of the matrix, which is how a loop run proves the reading is right.
      const delay = c.createDelay(1)
      delay.delayTime.value = 0.068
      bus.connect(delay)
      source = delay
      label = 'loop'
    } else {
      bus.connect(c.destination)
      // The same constraints Capture uses: any of these processors left on would cancel or duck the
      // echo this page exists to measure.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      })
      source = c.createMediaStreamSource(stream)
      label = stream.getAudioTracks()[0].label || 'unnamed mic'
    }
    setFilter({ kind: 'off' })
    capture = new Capture(c, '/worklets/onset-processor.js')
    await capture.start(DEFAULT_THRESHOLDS, { node: analysis, label })
    capture.onHit((h) => {
      const o = { t: h.t, peak: 10 ** (h.peakDb / 20) }
      onsets.push(o)
      onOnset?.(o)
    })
    capture.onMeter((m) => {
      bgDb = m.bgDb
    })
    el<HTMLButtonElement>('matrix').disabled = false
    el<HTMLButtonElement>('live').disabled = false
    // Recording ships the WAV over the channel: without one there is nowhere to send it.
    el<HTMLButtonElement>('record').disabled = remote === null
    setStatus(`ready · ${label} · ${c.sampleRate} Hz · ${outputInfo(c)}`)
    remote?.log('lab:ready', { label, sampleRate: c.sampleRate, loop: LOOP })
    return label
  } catch (err) {
    enableBtn.disabled = false
    throw err
  }
}

let matrixRunning = false

/** Every sound of the preset against every column: one cell = 8 clicks heard back through that filter. */
async function runMatrix(preset: 'hp' | 'lp'): Promise<{ preset: string; cells: number }> {
  const { ctx: c, bus: b } = enabled()
  // Two runs at once would interleave their clicks on the same bus and read each other's onsets;
  // a live metronome left running would do the same. The button alone cannot guard this: the
  // channel calls the function directly.
  if (matrixRunning) throw new Error('matrix already running')
  stop()
  const p = PRESETS[preset]
  const matrixBtn = el<HTMLButtonElement>('matrix')
  matrixBtn.disabled = true
  matrixRunning = true
  try {
    tableEl.hidden = false
    tableEl.innerHTML = `<tr><th>sound</th>${p.columns.map((col) => `<th>${colName(col)}</th>`).join('')}</tr>`
    for (const id of p.sounds) {
      const sound = soundFor(id)
      const tr = document.createElement('tr')
      tr.innerHTML = `<td>${sound.name}</td>`
      tableEl.appendChild(tr)
      for (const col of p.columns) {
        setStatus(`${sound.name} · ${colName(col)}`)
        setFilter(col)
        // 500 ms of silence before the first click: the biquads have just been rebuilt and the
        // detector's background estimate needs a moment to settle on the new band.
        await sleep(500)
        const t0 = c.currentTime + 0.3
        const clicks = Array.from({ length: N }, (_, i) => t0 + i * SPACING)
        const from = onsets.length
        for (const t of clicks) sound.play(b, t)
        // 800 ms past the last click: far more than the 68 ms of echo, so a late one still lands inside.
        await sleep((clicks[N - 1] - c.currentTime + 0.8) * 1000)
        const cell = matrixCell(clicks, onsets.slice(from), SPACING)
        const td = document.createElement('td')
        td.textContent =
          `${cell.heard}/${N}` +
          (cell.medianMs === null ? '' : ` · ${cell.medianMs} ms · ${cell.meanDb} dB`) +
          (cell.stray ? ` +${cell.stray} stray` : '')
        tr.appendChild(td)
        remote?.log('lab:matrix', { preset, sound: id, filter: colName(col), ...cell })
      }
    }
    setStatus(`done · ${label} · ${c.sampleRate} Hz · bg ${bgDb.toFixed(0)} dB · ${outputInfo(c)}`)
    remote?.log('lab:matrix:done', { preset })
    return { preset, cells: p.sounds.length * p.columns.length }
  } finally {
    matrixRunning = false
    matrixBtn.disabled = false
  }
}

let liveTimer: number | null = null
let bgTimer: number | null = null
let stopTimer: number | null = null
let running = false

/** Prints every onset, so a stroke on the pad can be watched with the filter on. */
function live(f: Filter, metro: string | null, seconds: number | null): void {
  const { ctx: c, bus: b } = enabled()
  stop() // a second `live` replaces the first instead of stacking two metronomes on the bus
  setFilter(f)
  logEl.textContent = ''
  running = true
  el<HTMLButtonElement>('live').textContent = 'Stop live'
  const clicks: number[] = []
  let heard = 0
  onOnset = (o) => {
    heard++
    let afterClickMs: number | null = null
    for (let i = clicks.length - 1; i >= 0; i--) {
      if (clicks[i] <= o.t) {
        afterClickMs = Math.round((o.t - clicks[i]) * 1000)
        break
      }
    }
    const peakDb = db(o.peak)
    const after = afterClickMs === null ? '' : ` · ${afterClickMs} ms after click`
    logEl.textContent += `${o.t.toFixed(3)} s · ${peakDb.toFixed(0)} dB${after}\n`
    logEl.scrollTop = logEl.scrollHeight
    remote?.log('lab:onset', { t: o.t, peakDb, afterClickMs })
  }
  const sound = metro === null ? null : soundFor(metro)
  if (sound) {
    // 300 ms of lookahead refilled every 100 ms: setInterval is free to be late, the audio clock is not.
    let next = c.currentTime + METRO_SPACING
    liveTimer = window.setInterval(() => {
      while (next < c.currentTime + 0.3) {
        sound.play(b, next)
        clicks.push(next)
        next += METRO_SPACING
      }
    }, 100)
  }
  bgTimer = window.setInterval(() => {
    setStatus(`live · ${label} · ${colName(f)} · bg ${bgDb.toFixed(0)} dB · ${outputInfo(c)}`)
  }, 500)
  if (seconds !== null) {
    stopTimer = window.setTimeout(() => {
      stop()
      remote?.log('lab:live:done', { filter: colName(f), metro, seconds, onsets: heard })
    }, seconds * 1000)
  }
}

function stop(): void {
  if (liveTimer !== null) window.clearInterval(liveTimer)
  if (bgTimer !== null) window.clearInterval(bgTimer)
  if (stopTimer !== null) window.clearTimeout(stopTimer)
  liveTimer = null
  bgTimer = null
  stopTimer = null
  onOnset = null
  running = false
  el<HTMLButtonElement>('live').textContent = 'Start live'
}

/** Ships `seconds` of the raw input over the channel, as a WAV the Mac can look at. */
async function record(seconds: number, name: string): Promise<string> {
  const { ctx: c, source: src } = enabled()
  if (!remote) throw new Error('no remote channel: open the page with ?remote')
  // The same 1..60 s window App allows: every sample is held in memory until the window ends, and
  // `/audio` refuses a body over 12 MB (60 s of mono float32 at 48 kHz). Throw rather than clamp, so a
  // typo like `{"seconds":600}` comes back as `cmd:error` instead of quietly recording something else.
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60)
    throw new Error(`seconds out of range (1..60): ${seconds}`)
  // The tap sits on the raw source, before the filter chain: a recording must show what the
  // microphone heard, not what the analysis band left of it.
  const tap = c.createGain()
  src.connect(tap)
  try {
    setStatus(`recording ${seconds} s of ${label}…`)
    const file = await remote.record(c, tap, seconds, name)
    setStatus(`recorded ${file}`)
    return file
  } finally {
    src.disconnect(tap)
  }
}

/** A button must never leave a rejection unhandled: the page has no console in front of it on iOS. */
function onClick(id: string, fn: () => unknown): void {
  el<HTMLButtonElement>(id).addEventListener('click', () => {
    try {
      const result = fn()
      if (result instanceof Promise) result.catch((err: Error) => setStatus(`error: ${err.message}`))
    } catch (err) {
      setStatus(`error: ${(err as Error).message}`)
    }
  })
}

onClick('enable', () => enable())
onClick('matrix', () => runMatrix(el<HTMLSelectElement>('preset').value === 'lp' ? 'lp' : 'hp'))
onClick('record', () => record(RECORD_SECONDS, 'mic'))
onClick('live', () => {
  if (running) return stop()
  live(parseFilter(el<HTMLSelectElement>('filter').value), el<HTMLSelectElement>('metro').value || null, null)
})

// `?remote[=name]`: the page logs what it does and takes the same commands the buttons call. Loaded on
// demand, like App.tsx does, so a run without the flag never opens the channel.
const remoteName = remoteNameFrom(location.search, navigator.userAgent, 'ontouchend' in document)
if (remoteName) {
  const m = await import('../src/dev/remote')
  remote = m.connectRemote(remoteName, navigator.userAgent, {
    // The server may hand out `mac-2` when a first page still holds `mac`, and that is the name `--to`
    // and the .ndjson file use. Only while the page is still waiting for its tap: after `enable()` the
    // status line belongs to the run.
    onName: (name) => {
      if (ctx === null) setStatus(`remote: ${name} · tap Enable`)
    },
  })
  m.registerBasics(remote, say)
  remote.on('matrix', (a) => runMatrix(a.preset === 'lp' ? 'lp' : 'hp'))
  remote.on('live', (a) =>
    live(
      parseFilter(String(a.filter ?? 'off')),
      a.metro ? String(a.metro) : null,
      a.seconds ? Number(a.seconds) : null,
    ),
  )
  remote.on('stop', () => stop())
  remote.on('record', (a) => record(Number(a.seconds ?? 10), String(a.label ?? 'mic')))
  remote.on('enable', () => enable()) // works only where audio needs no gesture (loop mode in Chrome)
  // Trailing `…` until `hello` lands: `remote.name` is still only the wanted name here, and the operator
  // must not copy it into `--to` before the server has settled it.
  setStatus(`remote: ${remoteName}… · tap Enable`)
}
