import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { Pref } from '../notation/fit'
import { BARS_PER_ROW_CHOICES, loadPrefs, savePrefs, type ViewMode, type ViewPrefs } from './prefs'
import { ThemePicker } from './ThemePicker'

const prefValue = (p: Pref): string => String(p)
const prefFrom = (s: string): Pref => (s === 'auto' ? 'auto' : Number(s))

/**
 * The app's settings: how the score follows the cursor, the bars per row (a ceiling on what fits,
 * never more), the theme. The tempo is the workout's, not the app's: it stays in the transport bar.
 * Saved on every change; the training screen reads the preferences when it mounts.
 */
export function Settings() {
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadPrefs(localStorage))
  const update = (patch: Partial<ViewPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(localStorage, next)
  }
  return (
    <main className="settings">
      <nav className="row">
        <Link to="/">Library</Link>
      </nav>
      <h1>Settings</h1>
      <div className="row settings__view">
        <label>
          Follow{' '}
          <select value={prefs.mode} onChange={(e) => update({ mode: e.target.value as ViewMode })}>
            <option value="scroll">scroll</option>
            <option value="pages">pages</option>
          </select>
        </label>
        <label>
          Bars per row{' '}
          <select
            value={prefValue(prefs.barsPerRow)}
            onChange={(e) => update({ barsPerRow: prefFrom(e.target.value) })}
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
    </main>
  )
}
