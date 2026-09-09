import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'

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
  for (let i = 0; i < N; i++) sig[i] = rnd() * 10 ** (-70 / 20)
  for (const h of hits) {
    const a = 10 ** (h.db / 20)
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
      // biome-ignore lint/style/noNonNullAssertion: an onset message always carries frame and peak, and if that stops being true the test must fail here.
      expect(Math.abs(o.frame! / SR - hits[i].t) * 1000).toBeLessThan(1)
      // biome-ignore lint/style/noNonNullAssertion: an onset message always carries frame and peak, and if that stops being true the test must fail here.
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
  // I test sopra usano `synth`, che pianta un impulso di UN campione sull'istante vero (`sig[start] += a`):
  // la soglia viene così attraversata per costruzione al campione giusto, e il timing torna esatto
  // qualunque cosa faccia il rilevatore. Verificano che il colpo sia RILEVATO, non che sia datato bene.
  // Un colpo vero ha una salita finita, e un rilevatore a soglia scatta tanto più tardi quanto più il
  // colpo è piano: è un bias che dipende dalla dinamica, quindi la calibrazione — un solo click, sempre
  // allo stesso livello — non può assorbirlo. Qui si misura proprio quello.
  it('data i colpi entro un millisecondo su tutta la dinamica, con attacco realistico', () => {
    const strokes = (peakDb: number, riseMs: number): { sig: Float32Array; trueFrames: number[] } => {
      const N = SR * 2
      const sig = new Float32Array(N)
      let seed = 7
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 2 - 1 }
      for (let i = 0; i < N; i++) sig[i] = rnd() * 10 ** (-70 / 20)
      const trueFrames = [0.5, 0.9, 1.3].map((t) => Math.round(t * SR))
      const peak = 10 ** (peakDb / 20)
      const rise = Math.max(1, Math.round((riseMs / 1000) * SR))
      for (const start of trueFrames) {
        for (let k = 0; k < Math.round(SR * 0.06); k++) {
          const env = k < rise ? k / rise : Math.exp(-(k - rise) / (SR * 0.008))
          sig[start + k] += peak * env * (0.7 * Math.sin((2 * Math.PI * 1500 * k) / SR) + 0.3 * rnd())
        }
      }
      return { sig, trueFrames }
    }

    // Da accento (−6) a ghost note (−30), con salite da pad vero.
    for (const riseMs of [0.2, 0.5, 1.0]) {
      for (const db of [-6, -12, -18, -24, -30]) {
        const { sig, trueFrames } = strokes(db, riseMs)
        const onsets = run(sig)
        expect(onsets, `${db} dB, salita ${riseMs} ms: colpi rilevati`).toHaveLength(trueFrames.length)
        onsets.forEach((o, i) => {
          // biome-ignore lint/style/noNonNullAssertion: an onset message always carries frame and peak, and if that stops being true the test must fail here.
          const biasMs = ((o.frame! - trueFrames[i]) / SR) * 1000
          // Sempre in ritardo, mai in anticipo: la soglia si attraversa dopo l'inizio della salita.
          expect(biasMs, `${db} dB, salita ${riseMs} ms: bias`).toBeGreaterThanOrEqual(0)
          expect(biasMs, `${db} dB, salita ${riseMs} ms: bias`).toBeLessThan(1)
        })
      }
    }
  })

  it('data il click di calibrazione con bias trascurabile: il riferimento della latenza è onesto', () => {
    // Se il click di riferimento fosse datato in ritardo, quel ritardo entrerebbe nella latenza
    // misurata e verrebbe poi sottratto a ogni colpo della sessione.
    const N = SR
    const sig = new Float32Array(N)
    let seed = 11
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff) * 2 - 1 }
    for (let i = 0; i < N; i++) sig[i] = rnd() * 10 ** (-70 / 20)
    const start = Math.round(0.5 * SR)
    // Stessa forma di scheduleClick: 1000 Hz, gain 0.8, rampa 0.5 ms, dur 10 ms.
    for (let k = 0; k < Math.round(SR * 0.014); k++) {
      const t = k / SR
      const env = t < 0.0005 ? t / 0.0005 : t < 0.0105 ? 1 : Math.max(0, 1 - (t - 0.0105) / 0.003)
      sig[start + k] += 0.8 * env * Math.sin(2 * Math.PI * 1000 * t)
    }
    const onsets = run(sig)
    expect(onsets).toHaveLength(1)
    // biome-ignore lint/style/noNonNullAssertion: an onset message always carries frame and peak, and if that stops being true the test must fail here.
    expect(((onsets[0].frame! - start) / SR) * 1000).toBeLessThan(0.1)
  })

  it('rispetta la soglia: a floor −25 dB il colpo a −30 non passa', () => {
    const { proc, out } = loadProcessor()
    const p = proc as unknown as { port: { onmessage: (e: { data: unknown }) => void } }
    p.port.onmessage({ data: { floor: 10 ** (-25 / 20) } })
    const sig = synth([{ t: 0.5, db: -30 }, { t: 1.0, db: -12 }])
    const g = globalThis as Record<string, unknown>
    for (let f = 0; f < sig.length; f += 128) {
      g.currentFrame = f
      proc.process([[sig.subarray(f, f + 128)]])
    }
    expect(out.filter((m) => m.type === 'onset')).toHaveLength(1)
  })
})
