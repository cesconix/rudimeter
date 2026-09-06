import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SR = 48000

interface Msg { type: string; frame?: number; peak?: number; bg?: number }

/** Istanzia il worklet in Node con gli stub del global scope AudioWorklet. */
function loadProcessor(): { proc: { process(inputs: Float32Array[][]): boolean }; out: Msg[] } {
  const out: Msg[] = []
  const g = globalThis as Record<string, unknown>
  // `as` evita che TS restringa il tipo a null (l'assegnazione avviene in una closure)
  let registered = null as (new () => { process(inputs: Float32Array[][]): boolean }) | null
  g.sampleRate = SR
  g.currentFrame = 0
  g.registerProcessor = (_name: string, cls: typeof registered) => { registered = cls }
  g.AudioWorkletProcessor = class {
    port = { onmessage: null as unknown, postMessage: (m: Msg) => out.push(m) }
  }
  const src = readFileSync(new URL('../../public/worklets/onset-processor.js', import.meta.url), 'utf8')
  new Function(src)()
  if (!registered) throw new Error('registerProcessor non chiamato')
  return { proc: new registered(), out }
}

function synth(hits: { t: number; db: number }[], seconds = 3): Float32Array {
  const N = SR * seconds
  const sig = new Float32Array(N)
  let seed = 1
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 2 - 1 }
  for (let i = 0; i < N; i++) sig[i] = rnd() * Math.pow(10, -70 / 20)
  for (const h of hits) {
    const a = Math.pow(10, h.db / 20)
    const start = Math.round(h.t * SR)
    for (let k = 0; k < SR * 0.05; k++) {
      sig[start + k] += a * Math.exp(-k / (SR * 0.01)) * Math.sin((2 * Math.PI * 180 * k) / SR)
    }
    sig[start] += a
  }
  return sig
}

function run(sig: Float32Array): Msg[] {
  const { proc, out } = loadProcessor()
  const g = globalThis as Record<string, unknown>
  for (let f = 0; f < sig.length; f += 128) {
    g.currentFrame = f
    proc.process([[sig.subarray(f, f + 128)]])
  }
  return out.filter((m) => m.type === 'onset')
}

describe('onset-processor', () => {
  it('rileva colpi piano e forte con timing esatto e picco fedele', () => {
    const hits = [{ t: 0.5, db: -30 }, { t: 1.0, db: -30 }, { t: 1.5, db: -12 }, { t: 2.0, db: -12 }]
    const onsets = run(synth(hits))
    expect(onsets).toHaveLength(4)
    onsets.forEach((o, i) => {
      expect(Math.abs(o.frame! / SR - hits[i].t) * 1000).toBeLessThan(1)
      expect(Math.abs(20 * Math.log10(o.peak!) - hits[i].db)).toBeLessThan(1.5)
    })
  })
  it('separa due colpi a 60 ms e non ritrigghera sulla coda', () => {
    const onsets = run(synth([{ t: 1.0, db: -20 }, { t: 1.06, db: -20 }]))
    expect(onsets).toHaveLength(2)
  })
  it('ignora il rumore di fondo', () => {
    expect(run(synth([]))).toHaveLength(0)
  })
  it('rispetta la soglia: a floor −25 dB il colpo a −30 non passa', () => {
    const { proc, out } = loadProcessor()
    const p = proc as unknown as { port: { onmessage: (e: { data: unknown }) => void } }
    p.port.onmessage({ data: { floor: Math.pow(10, -25 / 20) } })
    const sig = synth([{ t: 0.5, db: -30 }, { t: 1.0, db: -12 }])
    const g = globalThis as Record<string, unknown>
    for (let f = 0; f < sig.length; f += 128) {
      g.currentFrame = f
      proc.process([[sig.subarray(f, f + 128)]])
    }
    expect(out.filter((m) => m.type === 'onset')).toHaveLength(1)
  })
})
