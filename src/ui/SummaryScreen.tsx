import { useState } from 'react'
import { toMarkdown } from '../engine/report'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'

interface Props {
  stats: SessionStats
  exercise: Exercise
  bpm: number
  onRepeat(): void
  onPick(): void
}

const f = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d))

export function SummaryScreen({ stats, exercise, bpm, onRepeat, onPick }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const md = toMarkdown(stats, exercise, bpm, new Date())

  async function copy() {
    try {
      await navigator.clipboard.writeText(md)
      setCopied('copiato')
    } catch {
      setCopied('clipboard negata: seleziona il testo sotto')
    }
  }

  return (
    <main>
      <h1>{exercise.name} @ {bpm} bpm</h1>
      <p className="big">good {stats.good} · ok {stats.ok} · off {stats.off} · miss {stats.miss} · extra {stats.extras}</p>
      <p>Offset medio {f(stats.meanOffsetMs)} ms (σ {f(stats.sdOffsetMs)}) — positivo = in ritardo</p>
      <table>
        <thead><tr><th>Mano</th><th>Colpi</th><th>Offset</th><th>σ</th><th>dB</th><th>σ dB</th></tr></thead>
        <tbody>
          {stats.hands.map((h) => (
            <tr key={h.hand}><td>{h.hand}</td><td>{h.hits}/{h.slots}</td><td>{f(h.meanOffsetMs)}</td><td>{f(h.sdOffsetMs)}</td><td>{f(h.meanDb)}</td><td>{f(h.sdDb)}</td></tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead><tr><th>Ripetizioni</th><th>Miss</th><th>σ offset</th><th>dB</th></tr></thead>
        <tbody>
          {stats.blocks.map((b) => (
            <tr key={b.fromRepeat}><td>{b.fromRepeat + 1}–{b.toRepeat + 1}</td><td>{b.miss}/{b.slots}</td><td>{f(b.sdOffsetMs)}</td><td>{f(b.meanDb)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button onClick={onRepeat}>Ripeti</button>
        <button className="secondary" onClick={onPick}>Altro esercizio</button>
        <button className="secondary" onClick={copy}>Copia markdown</button>
        {copied && <span>{copied}</span>}
      </div>
      <pre>{md}</pre>
    </main>
  )
}
