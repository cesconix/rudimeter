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

/** "60 ×4 → 64 ×4": ripetizioni consecutive allo stesso bpm. */
export function bpmRuns(bpms: number[]): string {
  const runs: { bpm: number; n: number }[] = []
  for (const b of bpms) {
    const last = runs[runs.length - 1]
    if (last && last.bpm === b) last.n++
    else runs.push({ bpm: b, n: 1 })
  }
  return runs.map((r) => `${r.bpm} ×${r.n}`).join(' → ')
}

export function toMarkdown(stats: SessionStats, exercise: Exercise, bpm: number, date: Date, calibration?: ReportCalibration | null): string {
  const day = localDay(date)
  const cal = calibration
    ? [`Calibrazione: latenza ${f(calibration.latencyMs)} ms · pendenza ${f(calibration.slope, 2)}${calibration.deviceLabel ? ` · ${calibration.deviceLabel}` : ''}`]
    : []
  const lines = [
    `### ${day} — ${exercise.name} @ ${bpm} bpm`,
    '',
    // In cima, non in fondo: chi rilegge il report fra un mese deve incontrare la condizione PRIMA
    // dei numeri, non dopo averci creduto. Senza cuffie la guida rientra dal microfono sugli istanti
    // attesi e questi numeri raccontano un'esecuzione che non è avvenuta.
    ...(stats.guide ? ['> ⚠️ Suono guida attivo: i colpi della guida possono essere stati contati come tuoi.', ''] : []),
    `Slot ${stats.slots}: good ${stats.good} · ok ${stats.ok} · off ${stats.off} · miss ${stats.miss} · extra ${stats.extras}${stats.absorbed > 0 ? ` · assorbiti ${stats.absorbed}` : ''}`,
    `Offset medio ${f(stats.meanOffsetMs)} ms (σ ${f(stats.sdOffsetMs)})`,
    `Uniformità: σ dB ${f(stats.uniformity.sdDbTaps)}${stats.uniformity.hands.length > 0 ? ` (${stats.uniformity.hands.map((h) => `${h.hand} ${f(h.sdDbTaps)}`).join(' · ')})` : ''}`,
    ...(stats.accents.slots > 0
      ? [
          `Accenti: ${stats.accents.hits}/${stats.accents.slots} · ${stats.accents.meanDeltaDb === null ? '—' : `${stats.accents.meanDeltaDb >= 0 ? '+' : ''}${f(stats.accents.meanDeltaDb)}`} dB sui colpi normali · ${stats.accents.belowThreshold === null ? '—' : stats.accents.belowThreshold} sotto +${stats.accents.thresholdDb} dB`,
        ]
      : []),
    ...(new Set(stats.bpmByRepeat).size > 1 ? [`Bpm: ${bpmRuns(stats.bpmByRepeat)}`] : []),
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
