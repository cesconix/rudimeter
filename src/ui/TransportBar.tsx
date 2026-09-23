import { useEffect, useState, useSyncExternalStore } from 'react'
import { clampBpm, MAX_BPM, MIN_BPM, type Transport } from '../audio/transport'

interface Props {
  transport: Transport
  /** the drawn bar the cursor is on, 0-based */
  bar: number
  /** drawn bars in the piece: every pass of a repeat counts */
  bars: number
  /** the tempo, the workout's: one bpm for every piece (it counts the beat of the meter) */
  bpm: number
  /** Play is the screen's: it creates and resumes the audio context inside the gesture, then starts the transport */
  onPlay(): void
  onBpm(bpm: number): void
}

const BPM_STEP = 5

/** Play / pause, stop, the tempo and where the cursor is. */
export function TransportBar({ transport, bar, bars, bpm, onPlay, onBpm }: Props) {
  const state = useSyncExternalStore(transport.subscribe, () => transport.state)
  // The number field edits a draft and commits on blur or Enter: committing every keystroke would
  // clamp a half-typed "1" to 30 before the "20" arrives.
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => {
    setDraft(String(bpm))
  }, [bpm])
  const setBpm = (b: number) => onBpm(clampBpm(b))
  const commit = () => {
    const n = Number(draft)
    const next = Number.isFinite(n) && draft.trim() !== '' ? clampBpm(n) : bpm
    // Echoed back on purpose: a clamped or unchanged value leaves bpm as it was, and the effect above would not resync the field.
    setDraft(String(next))
    onBpm(next)
  }

  return (
    <div className="transport-bar">
      <div className="row">
        <button
          type="button"
          aria-label={state === 'playing' ? 'Pause' : 'Play'}
          onClick={() => (state === 'playing' ? transport.pause() : onPlay())}
        >
          {state === 'playing' ? '❚❚' : '▶'}
        </button>
        <button type="button" className="secondary" aria-label="Stop" onClick={() => transport.stop()}>
          ■
        </button>
        <button type="button" className="secondary" onClick={() => setBpm(bpm - BPM_STEP)}>
          −{BPM_STEP}
        </button>
        <input
          type="number"
          aria-label="Tempo in bpm"
          value={draft}
          min={MIN_BPM}
          max={MAX_BPM}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span>bpm</span>
        <button type="button" className="secondary" onClick={() => setBpm(bpm + BPM_STEP)}>
          +{BPM_STEP}
        </button>
        <span className="transport-bar__position">
          bar {bar + 1} / {bars}
        </span>
      </div>
    </div>
  )
}
