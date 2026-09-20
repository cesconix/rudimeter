import { SCORES } from '../data/scores'

interface Props {
  value: string
  onChange(id: string): void
}

/** The library as one list: title and, when the piece has one, its source — the book and the page. */
export function ScorePicker({ value, onChange }: Props) {
  return (
    <select aria-label="Piece" value={value} onChange={(e) => onChange(e.target.value)}>
      {SCORES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.source ? `${s.title} — ${s.source}` : s.title}
        </option>
      ))}
    </select>
  )
}
