import type { ClickKind } from '../engine/grid'

export interface ClickOptions {
  freq?: number
  gain?: number
  dur?: number
}

/** Primo movimento della battuta più acuto e più forte; suddivisioni più basse e più piano. */
export function clickOptionsFor(kind: ClickKind): ClickOptions {
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
