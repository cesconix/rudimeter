import type { Exercise, Judged } from '../engine/types'

interface Props {
  exercise: Exercise
  /** giudizi della ripetizione corrente, in ordine di stepIndex */
  judged: Judged[]
  /** stepIndex dello step in corso, o -1 */
  currentStep: number
  repeat: number
}

export function LiveGrid({ exercise, judged, currentStep, repeat }: Props) {
  const byStep = new Map(judged.map((j) => [j.slot.stepIndex, j]))
  return (
    <div>
      <p>Ripetizione {Math.min(repeat + 1, exercise.repeats)} / {exercise.repeats}</p>
      <div className="grid">
        {exercise.steps.map((step, i) => {
          if (!step.hand) return <div key={i} className="step rest">·</div>
          const j = byStep.get(i)
          const cls = ['step', j?.grade ?? 'pending', i === currentStep ? 'current' : ''].join(' ')
          return (
            <div key={i} className={cls} title={j?.offsetMs !== null && j?.offsetMs !== undefined ? `${j.offsetMs.toFixed(0)} ms` : ''}>
              {step.accent ? `>${step.hand}` : step.hand}
            </div>
          )
        })}
      </div>
    </div>
  )
}
