import type { Exercise } from './types'
import type { SessionStats } from './stats'

const f = (x: number | null, digits = 1): string => (x === null ? '—' : x.toFixed(digits))

const pad = (n: number): string => String(n).padStart(2, '0')

/** YYYY-MM-DD nel fuso locale: una sessione finita alle 00:30 appartiene al giorno che è appena iniziato, non a quello prima. */
const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Quel tanto di calibrazione che serve al log. Strutturalmente compatibile con CalibrationData, senza legare l'engine al layer audio. */
export interface ReportCalibration {
  latencyMs: number
  slope: number | null
  deviceLabel?: string
}

export function toMarkdown(stats: SessionStats, exercise: Exercise, bpm: number, date: Date, calibration?: ReportCalibration | null): string {
  const day = localDay(date)
  const cal = calibration
    ? [`Calibrazione: latenza ${f(calibration.latencyMs)} ms · pendenza ${f(calibration.slope, 2)}${calibration.deviceLabel ? ` · ${calibration.deviceLabel}` : ''}`]
    : []
  const lines = [
    `### ${day} — ${exercise.name} @ ${bpm} bpm`,
    '',
    `Slot ${stats.slots}: good ${stats.good} · ok ${stats.ok} · off ${stats.off} · miss ${stats.miss} · extra ${stats.extras}`,
    `Offset medio ${f(stats.meanOffsetMs)} ms (σ ${f(stats.sdOffsetMs)})`,
    ...cal,
    '',
    '| Mano | Colpi | Offset medio | σ | dB medio | σ dB |',
    '|---|---|---|---|---|---|',
    ...stats.hands.map((h) => `| ${h.hand} | ${h.hits}/${h.slots} | ${f(h.meanOffsetMs)} | ${f(h.sdOffsetMs)} | ${f(h.meanDb)} | ${f(h.sdDb)} |`),
    '',
    '| Ripetizioni | Miss | σ offset | dB medio |',
    '|---|---|---|---|',
    ...stats.blocks.map((b) => `| ${b.fromRepeat + 1}–${b.toRepeat + 1} | ${b.miss}/${b.slots} | ${f(b.sdOffsetMs)} | ${f(b.meanDb)} |`),
  ]
  return lines.join('\n')
}
