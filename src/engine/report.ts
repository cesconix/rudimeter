import type { SessionStats } from './stats'
import type { Exercise } from './types'

const f = (x: number | null, digits = 1): string => (x === null ? '—' : x.toFixed(digits))

const pad = (n: number): string => String(n).padStart(2, '0')

/** YYYY-MM-DD in the local time zone: a session ended at 00:30 belongs to the day that has just started, not the one before. */
const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Just as much calibration as the log needs. Structurally compatible with CalibrationData, without tying the engine to the audio layer. */
export interface ReportCalibration {
  latencyMs: number
  slope: number | null
  deviceLabel?: string
}

/** "60 ×4 → 64 ×4": consecutive repeats at the same bpm. */
export function bpmRuns(bpms: number[]): string {
  const runs: { bpm: number; n: number }[] = []
  for (const b of bpms) {
    const last = runs[runs.length - 1]
    if (last && last.bpm === b) last.n++
    else runs.push({ bpm: b, n: 1 })
  }
  return runs.map((r) => `${r.bpm} ×${r.n}`).join(' → ')
}

export function toMarkdown(
  stats: SessionStats,
  exercise: Exercise,
  bpm: number,
  date: Date,
  calibration?: ReportCalibration | null,
): string {
  const day = localDay(date)
  const cal = calibration
    ? [
        `Calibration: latency ${f(calibration.latencyMs)} ms · slope ${f(calibration.slope, 2)}${calibration.deviceLabel ? ` · ${calibration.deviceLabel}` : ''}`,
      ]
    : []
  const lines = [
    `### ${day} — ${exercise.name} @ ${bpm} bpm`,
    '',
    // At the top, not at the bottom: whoever rereads the report in a month must meet the condition
    // BEFORE the numbers, not after believing them. With no headphones the guide comes back in from
    // the microphone on the expected instants and these numbers tell a run that never happened.
    ...(stats.guide ? ['> ⚠️ Guide sound was on: guide strokes may have been counted as yours.', ''] : []),
    `Slots ${stats.slots}: good ${stats.good} · ok ${stats.ok} · off ${stats.off} · miss ${stats.miss} · extra ${stats.extras}${stats.absorbed > 0 ? ` · absorbed ${stats.absorbed}` : ''}`,
    `Mean offset ${f(stats.meanOffsetMs)} ms (σ ${f(stats.sdOffsetMs)})`,
    `Evenness: σ dB ${f(stats.uniformity.sdDbTaps)}${stats.uniformity.hands.length > 0 ? ` (${stats.uniformity.hands.map((h) => `${h.hand} ${f(h.sdDbTaps)}`).join(' · ')})` : ''}`,
    ...(stats.accents.slots > 0
      ? [
          `Accents: ${stats.accents.hits}/${stats.accents.slots} · ${stats.accents.meanDeltaDb === null ? '—' : `${stats.accents.meanDeltaDb >= 0 ? '+' : ''}${f(stats.accents.meanDeltaDb)}`} dB over plain strokes · ${stats.accents.belowThreshold === null ? '—' : stats.accents.belowThreshold} below +${stats.accents.thresholdDb} dB`,
        ]
      : []),
    ...(new Set(stats.bpmByRepeat).size > 1 ? [`Bpm: ${bpmRuns(stats.bpmByRepeat)}`] : []),
    ...cal,
    '',
    '| Hand | Strokes | Mean offset | σ | Mean dB | σ dB |',
    '|---|---|---|---|---|---|',
    ...stats.hands.map(
      (h) =>
        `| ${h.hand} | ${h.hits}/${h.slots} | ${f(h.meanOffsetMs)} | ${f(h.sdOffsetMs)} | ${f(h.meanDb)} | ${f(h.sdDb)} |`,
    ),
    '',
    '| Repeats | Miss | σ offset | Mean dB |',
    '|---|---|---|---|',
    ...stats.blocks.map(
      (b) => `| ${b.fromRepeat + 1}–${b.toRepeat + 1} | ${b.miss}/${b.slots} | ${f(b.sdOffsetMs)} | ${f(b.meanDb)} |`,
    ),
  ]
  return lines.join('\n')
}
