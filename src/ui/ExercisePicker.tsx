import { useState } from 'react'
import { EXERCISES } from '../data/exercises'
import { barsOf } from '../engine/exercise'
import { DEFAULT_AUTO_INCREMENT } from '../engine/progression'
import type { Exercise } from '../engine/types'
import type { SessionOptions } from './options'

/**
 * The whole sticking identifies a short exercise at a glance, which is why it is here. Past a few bars
 * it stops identifying anything and becomes a wall of letters — the pyramid is thirty bars — so there
 * the count is what the line has to say. The score below shows the notes either way.
 */
const stickingLabel = (ex: Exercise): string => (barsOf(ex) > 4 ? `${barsOf(ex)} bars` : ex.sticking)

interface Props {
  /** Last bpm chosen (or the default): seed of the local state, not a controlled value. */
  previousBpm: number
  /** Last options chosen (or `DEFAULT_SESSION_OPTIONS`): seed of the local state, not a controlled value. */
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
      <h1>Exercise</h1>
      <select aria-label="Exercise" value={id} onChange={(e) => setId(e.target.value)}>
        {EXERCISES.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.source ? ` — ${e.source}` : ''}
          </option>
        ))}
      </select>
      <p>
        <code>{stickingLabel(exercise)}</code> · {exercise.timeSignature.join('/')} · {exercise.repeats} repeats
      </p>
      <div className="row">
        <button type="button" className="secondary" onClick={() => setBpm((b) => Math.max(30, b - 5))}>
          −5
        </button>
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
        <button type="button" className="secondary" onClick={() => setBpm((b) => Math.min(240, b + 5))}>
          +5
        </button>
      </div>
      <fieldset className="transport">
        <legend>Transport</legend>
        <label>
          Clicks per beat
          <select
            value={clickSubdivision}
            onChange={(e) => setClickSubdivision(Number(e.target.value) as 1 | 2 | 3 | 4)}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Guide sound: one hit on
          every note, louder on accents
        </label>
        <label>
          <input type="checkbox" checked={gap} onChange={(e) => setGap(e.target.checked)} /> Gap training: 2 bars with
          click, 2 without
        </label>
        <label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-increment: +
          {DEFAULT_AUTO_INCREMENT.step} bpm after {DEFAULT_AUTO_INCREMENT.after} clean repeats (≥{' '}
          {DEFAULT_AUTO_INCREMENT.minAccuracy * 100} %)
        </label>
      </fieldset>
      {/* With the guide on the warning changes in kind, not in tone: the click coming back from the
          speaker falls on the beats and dirties the result, the guide falls on the expected instants
          and falsifies it — the session would report a perfect run that never happened. */}
      <p className={guide ? 'error' : undefined}>
        {guide
          ? 'Headphones are mandatory with the guide sound: from the speaker it comes back into the microphone exactly on the expected notes, and the session would score perfect without you playing.'
          : 'Put your headphones on before starting: the click from the speaker would be counted as a stroke.'}
      </p>
      <div className="row">
        <button type="button" onClick={() => onPick(exercise, bpm, options)}>
          Start
        </button>
        <button type="button" className="secondary" onClick={onRecalibrate}>
          Recalibrate
        </button>
      </div>
    </main>
  )
}
