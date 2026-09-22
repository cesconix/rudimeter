import { type ReactNode, useState } from 'react'
import { applyTheme } from './apply-theme'
import { loadTheme, saveTheme, THEMES, type Theme, type ThemeChoice } from './themes'

/**
 * A tile's face: a `data-theme` of its own, so it paints itself with that theme's tokens — its
 * background, its text, and three dots for the accent, the secondary text and the text. The button
 * around it stays in the page's theme: the chosen tile's ring is the page's accent.
 */
function Face({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <span className="theme-tile__face" data-theme={id}>
      {children}
      <span className="theme-tile__dots" aria-hidden="true">
        <i className="theme-tile__dot--main" />
        <i className="theme-tile__dot--sub" />
        <i className="theme-tile__dot--text" />
      </span>
    </span>
  )
}

/**
 * The theme of every page: System first — split, light and dark, as it follows the device — then the
 * light themes and the dark ones. A tap applies and saves; nothing asks.
 */
export function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(() => loadTheme(localStorage))
  const pick = (next: ThemeChoice) => {
    setChoice(next)
    saveTheme(localStorage, next)
    applyTheme(next)
  }
  const tile = (theme: Theme) => (
    <button
      key={theme.id}
      type="button"
      aria-pressed={choice === theme.id}
      className="theme-tile"
      onClick={() => pick(theme.id)}
    >
      <Face id={theme.id}>{theme.name}</Face>
    </button>
  )
  return (
    <fieldset className="theme-picker">
      <legend className="theme-picker__group">Theme</legend>
      <div className="theme-picker__grid">
        <button
          type="button"
          aria-pressed={choice === 'system'}
          className="theme-tile theme-tile--system"
          onClick={() => pick('system')}
        >
          <Face id="rudimeter-light">System</Face>
          <Face id="rudimeter-dark" />
        </button>
      </div>
      <p className="theme-picker__group">Light</p>
      <div className="theme-picker__grid">{THEMES.filter((t) => t.scheme === 'light').map(tile)}</div>
      <p className="theme-picker__group">Dark</p>
      <div className="theme-picker__grid">{THEMES.filter((t) => t.scheme === 'dark').map(tile)}</div>
    </fieldset>
  )
}
