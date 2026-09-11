// Candidate metronome/guide sounds for the audio lab (dev/lab.ts) and the pure helpers that read its
// matrix. Ported from the two throwaway spike pages (public/spike.html, public/listen.html): the
// question they answered is which click the speaker can play without the onset detector hearing its
// own echo, once the analysis path is filtered.
//
// The three "current" sounds are not copies of the app's click: they call `scheduleClick` with
// `clickOptionsFor`, so the matrix measures the beep the app really plays today, not a look-alike.

import { clickOptionsFor, scheduleClick } from '../src/audio/click'
import { noiseBuffer } from '../src/audio/noise'

export interface Sound {
  name: string
  play(bus: AudioNode, t: number): void
}

/** Raised-cosine edges (1.5 ms up, 4 ms hold, 2.5 ms down over 8 ms): the edges stop spraying energy upward. */
export function softBeepCurve(gain: number, n: number): Float32Array {
  const total = 0.008
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * total
    let e = 1
    if (x < 0.0015) e = 0.5 * (1 - Math.cos((Math.PI * x) / 0.0015))
    else if (x > 0.0055) e = 0.5 * (1 + Math.cos((Math.PI * (x - 0.0055)) / 0.0025))
    curve[i] = gain * e
  }
  return curve
}

/** Same length as today's beep, with the soft edges above: 128 points over 8 ms is one point per 62 µs. */
function softBeep(bus: AudioNode, t: number, freq: number, gain: number): void {
  const ctx = bus.context
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = freq
  const total = 0.008
  const curve = softBeepCurve(gain, 128)
  g.gain.setValueAtTime(0, t)
  g.gain.setValueCurveAtTime(curve, t, total)
  osc.connect(g).connect(bus)
  osc.start(t)
  osc.stop(t + total + 0.005)
}

/** Candidate click: sine under a Hann window, so its spectrum stays around the carrier. */
function hann(bus: AudioNode, t: number, freq: number, gain: number, dur = 0.005): void {
  const ctx = bus.context
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = freq
  const n = 64
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = gain * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  g.gain.setValueAtTime(0, t)
  g.gain.setValueCurveAtTime(curve, t, dur)
  osc.connect(g).connect(bus)
  osc.start(t)
  osc.stop(t + dur + 0.005)
}

/**
 * Guide stroke: noise through a bandpass, exponential decay (the app's accent: 2600 Hz, Q 1.2, 50 ms).
 * With `hp`, two highpass stages (24 dB/oct) first, to keep the noise above the analysis band.
 */
function guide(bus: AudioNode, t: number, band: number, hp?: number): void {
  const ctx = bus.context
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  let node: AudioNode = src
  if (hp) {
    for (let i = 0; i < 2; i++) {
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = hp
      // 1/√2: a single Butterworth section, flat up to the corner (the spike wrote it rounded, as 0.707).
      f.Q.value = Math.SQRT1_2
      node = node.connect(f)
    }
  }
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = band
  bp.Q.value = 1.2
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.5, t + 0.001)
  // Exponential and not linear, as in scheduleGuide: the tail dying out is what reads as a stroke.
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  node.connect(bp).connect(g).connect(bus)
  src.start(t)
  src.stop(t + 0.06)
}

/**
 * Every candidate the two spike pages played, one entry per id. `sine1000` / `bar1500` / `sub800` are
 * the app's beat / bar / sub clicks (1000 Hz · 0.5, 1500 Hz · 0.6, 800 Hz · 0.25), straight from
 * `clickOptionsFor`; the rest are candidates that try to sit above the analysis band.
 */
export const SOUNDS: Record<string, Sound> = {
  sine1000: {
    name: 'beep 1 kHz · 0.5 (current beat)',
    play: (b, t) => scheduleClick(b, t, clickOptionsFor('beat')),
  },
  bar1500: {
    name: 'beep 1.5 kHz · 0.6 (current bar)',
    play: (b, t) => scheduleClick(b, t, clickOptionsFor('bar')),
  },
  sub800: {
    name: 'beep 800 Hz · 0.25 (current sub)',
    play: (b, t) => scheduleClick(b, t, clickOptionsFor('sub')),
  },
  soft1000: { name: 'soft beep 1 kHz · 0.5', play: (b, t) => softBeep(b, t, 1000, 0.5) },
  soft1500: { name: 'soft beep 1.5 kHz · 0.6', play: (b, t) => softBeep(b, t, 1500, 0.6) },
  soft1200: { name: 'soft beep 1.2 kHz · 0.6 (lower bar)', play: (b, t) => softBeep(b, t, 1200, 0.6) },
  hann8k: { name: 'hann 8 kHz', play: (b, t) => hann(b, t, 8000, 0.6) },
  hann6k: { name: 'hann 6 kHz', play: (b, t) => hann(b, t, 6000, 0.6) },
  // Today's exact shape (0.5 ms attack, 5 ms hold, 3 ms release) moved up. The set is 7000 / 6000 /
  // 5500 Hz for bar / beat / sub; the matrix plays one sound per cell, so it measures the beat.
  beephigh: { name: 'beep 6 kHz · 0.5 (high beat)', play: (b, t) => scheduleClick(b, t, { freq: 6000, gain: 0.5 }) },
  guide2600: { name: 'noise bp 2.6 kHz (current guide)', play: (b, t) => guide(b, t, 2600) },
  hiss7k: { name: 'noise hp 5 kHz + bp 7 kHz', play: (b, t) => guide(b, t, 7000, 5000) },
}

export type Filter = { kind: 'off' } | { kind: 'lp' | 'hp'; f: number }

export function parseFilter(s: string): Filter {
  if (s === 'off') return { kind: 'off' }
  const m = /^(lp|hp):(\d+)$/.exec(s)
  if (!m) throw new Error(`filter must be off, lp:<hz> or hp:<hz>, got "${s}"`)
  return { kind: m[1] as 'lp' | 'hp', f: Number(m[2]) }
}

/**
 * One matrix run: the sounds worth trying against the filters that could hide them.
 * `hp` keeps today's beeps and asks how high the analysis floor must go before they disappear;
 * `lp` keeps the analysis where it is today and asks which candidate click escapes upward.
 */
export const PRESETS: Record<'hp' | 'lp', { columns: Filter[]; sounds: string[] }> = {
  hp: {
    columns: [{ kind: 'off' }, { kind: 'hp', f: 3000 }, { kind: 'hp', f: 3500 }, { kind: 'hp', f: 4000 }],
    sounds: ['sine1000', 'bar1500', 'sub800', 'soft1000', 'soft1500', 'soft1200'],
  },
  lp: {
    columns: [{ kind: 'off' }, { kind: 'lp', f: 3000 }, { kind: 'lp', f: 2500 }, { kind: 'lp', f: 2000 }],
    sounds: ['sine1000', 'hann8k', 'hann6k', 'guide2600', 'hiss7k', 'beephigh'],
  },
}

const db = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -120)

/** Every onset goes to the last click at or before it (5 ms of slack): offset = echo latency when under the spacing. */
export function matrixCell(
  clicks: number[],
  onsets: { t: number; peak: number }[],
  spacing: number,
): { heard: number; medianMs: number | null; meanDb: number | null; stray: number } {
  const heard = new Set<number>()
  const offsets: number[] = []
  const peaks: number[] = []
  let stray = 0
  for (const o of onsets) {
    let k = -1
    for (let i = clicks.length - 1; i >= 0; i--) {
      if (clicks[i] <= o.t + 0.005) {
        k = i
        break
      }
    }
    const off = k < 0 ? Number.POSITIVE_INFINITY : (o.t - clicks[k]) * 1000
    if (off >= spacing * 1000) {
      stray++
      continue
    }
    heard.add(k)
    offsets.push(off)
    peaks.push(o.peak)
  }
  const sorted = [...offsets].sort((a, b) => a - b)
  return {
    heard: heard.size,
    medianMs: sorted.length ? Math.round(sorted[sorted.length >> 1]) : null,
    meanDb: peaks.length ? Math.round(db(peaks.reduce((a, p) => a + p, 0) / peaks.length)) : null,
    stray,
  }
}
