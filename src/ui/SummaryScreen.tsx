import { type ReactNode, useState } from 'react'
import type { CalibrationData } from '../audio/storage'
import { bpmRuns, toMarkdown } from '../engine/report'
import type { SessionStats } from '../engine/stats'
import type { Exercise } from '../engine/types'

interface Props {
  stats: SessionStats
  exercise: Exercise
  bpm: number
  calibration: CalibrationData | null
  onRepeat(): void
  onPick(): void
  children?: ReactNode
}

const f = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d))

export function SummaryScreen({ stats, exercise, bpm, calibration, onRepeat, onPick, children }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const md = toMarkdown(stats, exercise, bpm, new Date(), calibration)

  async function copy() {
    try {
      await navigator.clipboard.writeText(md)
      setCopied('copied')
    } catch {
      setCopied('clipboard denied: select the text below')
    }
  }

  return (
    <main>
      <h1>
        {exercise.name} @ {bpm} bpm
      </h1>
      <p className="big">
        good {stats.good} · ok {stats.ok} · off {stats.off} · miss {stats.miss} · extra {stats.extras}
        {stats.absorbed > 0 ? ` · absorbed ${stats.absorbed}` : ''}
      </p>
      <p>
        Mean offset {f(stats.meanOffsetMs)} ms (σ {f(stats.sdOffsetMs)}) — positive = late
      </p>
      <p>
        Evenness: σ dB {f(stats.uniformity.sdDbTaps)}
        {stats.uniformity.hands.length > 0
          ? ` (${stats.uniformity.hands.map((h) => `${h.hand} ${f(h.sdDbTaps)}`).join(' · ')})`
          : ''}
      </p>
      {stats.accents.slots > 0 && (
        <p>
          Accents: {stats.accents.hits}/{stats.accents.slots} ·{' '}
          {stats.accents.meanDeltaDb === null
            ? '—'
            : `${stats.accents.meanDeltaDb >= 0 ? '+' : ''}${f(stats.accents.meanDeltaDb)}`}{' '}
          dB over plain strokes · {stats.accents.belowThreshold === null ? '—' : stats.accents.belowThreshold} below +
          {stats.accents.thresholdDb} dB
        </p>
      )}
      {new Set(stats.bpmByRepeat).size > 1 && <p>Bpm: {bpmRuns(stats.bpmByRepeat)}</p>}
      <table>
        <thead>
          <tr>
            <th>Hand</th>
            <th>Strokes</th>
            <th>Offset</th>
            <th>σ</th>
            <th>dB</th>
            <th>σ dB</th>
          </tr>
        </thead>
        <tbody>
          {stats.hands.map((h) => (
            <tr key={h.hand}>
              <td>{h.hand}</td>
              <td>
                {h.hits}/{h.slots}
              </td>
              <td>{f(h.meanOffsetMs)}</td>
              <td>{f(h.sdOffsetMs)}</td>
              <td>{f(h.meanDb)}</td>
              <td>{f(h.sdDb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Repeats</th>
            <th>Miss</th>
            <th>σ offset</th>
            <th>dB</th>
          </tr>
        </thead>
        <tbody>
          {stats.blocks.map((b) => (
            <tr key={b.fromRepeat}>
              <td>
                {b.fromRepeat + 1}–{b.toRepeat + 1}
              </td>
              <td>
                {b.miss}/{b.slots}
              </td>
              <td>{f(b.sdOffsetMs)}</td>
              <td>{f(b.meanDb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button type="button" onClick={onRepeat}>
          Repeat
        </button>
        <button type="button" className="secondary" onClick={onPick}>
          Another exercise
        </button>
        <button type="button" className="secondary" onClick={copy}>
          Copy markdown
        </button>
        {copied && <span>{copied}</span>}
      </div>
      {/* Dev-only extras (the feedback box) sit here, above the markdown copy: on an iPad the `<pre>` runs
          past the fold and a box under it would go unseen. */}
      {children}
      <pre>{md}</pre>
    </main>
  )
}
