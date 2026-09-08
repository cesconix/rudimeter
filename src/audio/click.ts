import type { MetronomeKind } from '../engine/grid'

export interface ClickOptions {
  freq?: number
  gain?: number
  dur?: number
}

/** Primo movimento della battuta più acuto e più forte; suddivisioni più basse e più piano. */
export function clickOptionsFor(kind: MetronomeKind): ClickOptions {
  if (kind === 'bar') return { freq: 1500, gain: 0.6 }
  if (kind === 'sub') return { freq: 800, gain: 0.25 }
  return { freq: 1000, gain: 0.5 }
}

/** Sinusoide breve con inviluppo corto, schedulata nel clock del contesto. */
export function scheduleClick(ctx: AudioContext, time: number, opts: ClickOptions = {}): void {
  const { freq = 1000, gain = 0.5, dur = 0.005 } = opts
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(gain, time + 0.0005)
  g.gain.setValueAtTime(gain, time + dur)
  g.gain.linearRampToValueAtTime(0, time + dur + 0.003)
  osc.connect(g).connect(ctx.destination)
  osc.start(time)
  osc.stop(time + dur + 0.01)
}

/** Durata del rumore in cache: più lunga del colpo più lungo, così l'inviluppo non finisce il materiale. */
const NOISE_SEC = 0.08
// Un buffer per contesto, non uno per colpo: a sedicesimi veloci sarebbero decine di allocazioni al
// secondo dentro la finestra di lookahead, cioè jitter proprio dove serve precisione. `WeakMap` e non
// una variabile: il contesto si chiude e si riapre (permesso microfono, ripresa da iOS) e un buffer
// legato al contesto vecchio non suonerebbe.
const noiseByCtx = new WeakMap<AudioContext, AudioBuffer>()

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseByCtx.get(ctx)
  if (cached) return cached
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(NOISE_SEC * ctx.sampleRate)), ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseByCtx.set(ctx, buf)
  return buf
}

/**
 * Colpo di guida: rumore breve attraverso un passa-banda, non una sinusoide. Il metronomo è già
 * fatto di bip, e due bip a frequenze diverse sotto le cuffie, con le bacchette in mano, si
 * confondono: il rumore filtrato si legge come "colpo", il click come "tempo". L'accento è più
 * forte E più brillante — solo più forte, a volume di studio, non si sente abbastanza.
 */
export function scheduleGuide(ctx: AudioContext, time: number, accent: boolean): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = accent ? 2600 : 1900
  band.Q.value = 1.2
  const g = ctx.createGain()
  const peak = accent ? 0.5 : 0.24
  const decay = accent ? 0.05 : 0.035
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + 0.001)
  // Esponenziale e non lineare: la coda che si spegne è ciò che fa "colpo" invece di "tac". Non può
  // puntare a zero — `exponentialRampToValueAtTime` con 0 è un errore — quindi si scende a un valore
  // inudibile e si stacca la sorgente subito dopo.
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay)
  src.connect(band).connect(g).connect(ctx.destination)
  src.start(time)
  src.stop(time + decay + 0.01)
}
