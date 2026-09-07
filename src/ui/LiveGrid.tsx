import { slotsPerRepeat, stepsFlat } from '../engine/exercise'
import type { Exercise, Judged } from '../engine/types'

interface Props {
  exercise: Exercise
  /** giudizi della ripetizione corrente */
  judged: Judged[]
  /** index dello slot in corso, o -1 */
  currentSlot: number
  repeat: number
}

const label = (f: { step: { hand: string | null; accent: boolean; ornament?: string } }): string => {
  const s = f.step
  if (!s.hand) return '·'
  const orn = s.ornament ? { flam: 'f', drag: 'd', buzz: 'z', tremolo: 't' }[s.ornament] : ''
  return `${s.accent ? '>' : ''}${orn}${s.hand}`
}

export function LiveGrid({ exercise, judged, currentSlot, repeat }: Props) {
  const bySlot = new Map(judged.map((j) => [j.slot.index, j]))
  const perRepeat = slotsPerRepeat(exercise)
  let k = 0
  return (
    <div>
      <p>Ripetizione {Math.min(repeat + 1, exercise.repeats)} / {exercise.repeats}</p>
      <div className="grid">
        {stepsFlat(exercise).map((f) => {
          if (!f.step.hand) return <div key={f.ordinal} className="step rest">·</div>
          const index = repeat * perRepeat + k++
          const j = bySlot.get(index)
          const cls = ['step', j?.grade ?? 'pending', index === currentSlot ? 'current' : ''].join(' ')
          const title = j?.offsetMs !== null && j?.offsetMs !== undefined ? `${j.offsetMs.toFixed(0)} ms` : ''
          return <div key={f.ordinal} className={cls} title={title}>{label(f)}</div>
        })}
      </div>
    </div>
  )
}
