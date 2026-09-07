import { useState } from 'react'
import { EXERCISES } from '../data/exercises'
import type { Exercise } from '../engine/types'

interface Props {
  onPick(exercise: Exercise, bpm: number): void
  onRecalibrate(): void
}

export function ExercisePicker({ onPick, onRecalibrate }: Props) {
  const [id, setId] = useState(EXERCISES[0].id)
  const [bpm, setBpm] = useState(60)
  const exercise = EXERCISES.find((e) => e.id === id) ?? EXERCISES[0]
  const sticking = exercise.steps.map((s) => (s.hand ? (s.accent ? `>${s.hand}` : s.hand) : '-')).join(' ')

  return (
    <main>
      <h1>Esercizio</h1>
      <div className="grid">
        {EXERCISES.map((e) => (
          <button key={e.id} className={e.id === id ? '' : 'secondary'} onClick={() => setId(e.id)}>{e.name}</button>
        ))}
      </div>
      <p><code>{sticking}</code> · {exercise.timeSignature.join('/')} · {exercise.repeats} ripetizioni</p>
      <div className="row">
        <button className="secondary" onClick={() => setBpm((b) => Math.max(30, b - 5))}>−5</button>
        <input
          type="number"
          value={bpm}
          min={30}
          max={240}
          onChange={(e) => {
            const n = Number(e.target.value) || 60
            setBpm(Math.min(240, Math.max(30, n)))
          }}
        />
        <span>bpm</span>
        <button className="secondary" onClick={() => setBpm((b) => Math.min(240, b + 5))}>+5</button>
      </div>
      <p>Metti le cuffie prima di partire: il click dallo speaker verrebbe contato come colpo.</p>
      <div className="row">
        <button onClick={() => onPick(exercise, bpm)}>Parti</button>
        <button className="secondary" onClick={onRecalibrate}>Ricalibra</button>
      </div>
    </main>
  )
}
