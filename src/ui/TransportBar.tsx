import { useEffect, useState, useSyncExternalStore } from 'react'
import { clampBpm, MAX_BPM, MIN_BPM, type Transport } from '../audio/transport'
import type { Pref } from '../notation/fit'
import { BARS_PER_ROW_CHOICES, type ViewMode, type ViewPrefs } from './prefs'
import { ThemePicker } from './ThemePicker'

interface Props {
  transport: Transport
  /** the drawn bar the cursor is on, 0-based */
  bar: number
  /** drawn bars in the piece: every pass of a repeat counts */
  bars: number
  prefs: ViewPrefs
  /** Play is the screen's: it creates and resumes the audio context inside the gesture, then starts the transport */
  onPlay(): void
  onPrefs(patch: Partial<ViewPrefs>): void
}

const BPM_STEP = 5

const prefValue = (p: Pref): string => String(p)
const prefFrom = (s: string): Pref => (s === 'auto' ? 'auto' : Number(s))

/** Play / pause, stop, the tempo, where the cursor is, and the view settings and the theme behind one button. */
export function TransportBar({ transport, bar, bars, prefs, onPlay, onPrefs }: Props) {
  const state = useSyncExternalStore(transport.subscribe, () => transport.state)
  const [settings, setSettings] = useState(false)
  // The number field edits a draft and commits on blur or Enter: committing every keystroke would
  // clamp a half-typed "1" to 30 before the "20" arrives.
  const [draft, setDraft] = useState(String(prefs.bpm))
  useEffect(() => {
    setDraft(String(prefs.bpm))
  }, [prefs.bpm])
  const setBpm = (b: number) => onPrefs({ bpm: clampBpm(b) })
  const commit = () => {
    const n = Number(draft)
    const next = Number.isFinite(n) && draft.trim() !== '' ? clampBpm(n) : prefs.bpm
    // Echoed back on purpose: a clamped or unchanged value leaves prefs.bpm as it was, and the effect above would not resync the field.
    setDraft(String(next))
    onPrefs({ bpm: next })
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
        <button type="button" className="secondary" onClick={() => setBpm(prefs.bpm - BPM_STEP)}>
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
        <button type="button" className="secondary" onClick={() => setBpm(prefs.bpm + BPM_STEP)}>
          +{BPM_STEP}
        </button>
        <span className="transport-bar__position">
          bar {bar + 1} / {bars}
        </span>
        <button type="button" className="secondary" aria-expanded={settings} onClick={() => setSettings((s) => !s)}>
          View
        </button>
      </div>
      {settings && (
        <>
          <div className="row transport-bar__settings">
            <label>
              Follow{' '}
              <select value={prefs.mode} onChange={(e) => onPrefs({ mode: e.target.value as ViewMode })}>
                <option value="scroll">scroll</option>
                <option value="pages">pages</option>
              </select>
            </label>
            <label>
              Bars per row{' '}
              <select
                value={prefValue(prefs.barsPerRow)}
                onChange={(e) => onPrefs({ barsPerRow: prefFrom(e.target.value) })}
              >
                {BARS_PER_ROW_CHOICES.map((c) => (
                  <option key={prefValue(c)} value={prefValue(c)}>
                    {prefValue(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ThemePicker />
        </>
      )}
    </div>
  )
}
