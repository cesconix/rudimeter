import type { Exercise } from './types'
import type { SessionStats } from './stats'

const f = (x: number | null, digits = 1): string => (x === null ? '—' : x.toFixed(digits))

export function toMarkdown(stats: SessionStats, exercise: Exercise, bpm: number, date: Date): string {
  const day = date.toISOString().slice(0, 10)
  const lines = [
    `### ${day} — ${exercise.name} @ ${bpm} bpm`,
    '',
    `Slot ${stats.slots}: good ${stats.good} · ok ${stats.ok} · off ${stats.off} · miss ${stats.miss} · extra ${stats.extras}`,
    `Offset medio ${f(stats.meanOffsetMs)} ms (σ ${f(stats.sdOffsetMs)})`,
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
