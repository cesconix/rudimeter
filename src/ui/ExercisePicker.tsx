import { useState } from 'react'
import { EXERCISES } from '../data/exercises'
import { DEFAULT_AUTO_INCREMENT } from '../engine/progression'
import type { Exercise } from '../engine/types'
import type { SessionOptions } from './App'

interface Props {
  /** Ultimo bpm scelto (o il default): seed dello stato locale, non un valore controllato. */
  previousBpm: number
  /** Ultime opzioni scelte (o `DEFAULT_SESSION_OPTIONS`): seed dello stato locale, non un valore controllato. */
  previousOptions: SessionOptions
  onPick(exercise: Exercise, bpm: number, options: SessionOptions): void
  onRecalibrate(): void
}

export function ExercisePicker({ previousBpm, previousOptions, onPick, onRecalibrate }: Props) {
  const [id, setId] = useState(EXERCISES[0].id)
  const [bpm, setBpm] = useState(previousBpm)
  const [clickSubdivision, setClickSubdivision] = useState<1 | 2 | 3 | 4>(previousOptions.metronome.clickSubdivision)
  const [gap, setGap] = useState(previousOptions.metronome.gap !== undefined)
  const [guide, setGuide] = useState(previousOptions.metronome.guide === true)
  const [auto, setAuto] = useState(previousOptions.autoIncrement !== null)
  const exercise = EXERCISES.find((e) => e.id === id) ?? EXERCISES[0]
  const options: SessionOptions = {
    metronome: { clickSubdivision, gap: gap ? { on: 2, off: 2 } : undefined, guide },
    autoIncrement: auto ? DEFAULT_AUTO_INCREMENT : null,
  }

  return (
    <main>
      <h1>Esercizio</h1>
      <select aria-label="Esercizio" value={id} onChange={(e) => setId(e.target.value)}>
        {EXERCISES.map((e) => <option key={e.id} value={e.id}>{e.name}{e.source ? ` — ${e.source}` : ''}</option>)}
      </select>
      <p><code>{exercise.sticking}</code> · {exercise.timeSignature.join('/')} · {exercise.repeats} ripetizioni</p>
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
      <fieldset className="transport">
        <legend>Trasporto</legend>
        <label>
          Click per movimento
          <select value={clickSubdivision} onChange={(e) => setClickSubdivision(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
          </select>
        </label>
        <label><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Suono guida: un colpo su ogni nota, più forte sugli accenti</label>
        <label><input type="checkbox" checked={gap} onChange={(e) => setGap(e.target.checked)} /> Gap training: 2 battute con click, 2 senza</label>
        <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-increment: +{DEFAULT_AUTO_INCREMENT.step} bpm dopo {DEFAULT_AUTO_INCREMENT.after} ripetizioni pulite (≥ {DEFAULT_AUTO_INCREMENT.minAccuracy * 100} %)</label>
      </fieldset>
      {/* Con la guida attiva l'avviso cambia di natura, non di tono: il click che rientra dallo
          speaker cade sui movimenti e sporca il risultato, la guida cade sugli istanti attesi e lo
          falsifica — la sessione riporterebbe un'esecuzione perfetta che non è avvenuta. */}
      <p className={guide ? 'error' : undefined}>
        {guide
          ? 'Cuffie obbligatorie con il suono guida: dallo speaker rientra nel microfono esattamente sulle note attese, e la sessione risulterebbe perfetta senza che tu abbia suonato.'
          : 'Metti le cuffie prima di partire: il click dallo speaker verrebbe contato come colpo.'}
      </p>
      <div className="row">
        <button onClick={() => onPick(exercise, bpm, options)}>Parti</button>
        <button className="secondary" onClick={onRecalibrate}>Ricalibra</button>
      </div>
    </main>
  )
}
