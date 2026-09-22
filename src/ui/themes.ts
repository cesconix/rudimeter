import type { KeyValueStore } from '../audio/storage'

/** A theme of the catalogue: its palette is a `[data-theme="<id>"]` block of themes.css, nowhere else. */
export interface Theme {
  id: string
  name: string
  scheme: 'light' | 'dark'
  /** where the palette comes from, and its licence */
  source: string
}

/** The picker's order: the light themes, then the dark ones, Rudimeter's own first in each. */
export const THEMES: readonly Theme[] = [
  { id: 'rudimeter-light', name: 'Rudimeter Light', scheme: 'light', source: 'Rudimeter' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', scheme: 'light', source: 'catppuccin/palette, MIT' },
  { id: 'solarized-light', name: 'Solarized Light', scheme: 'light', source: 'altercation/solarized, MIT' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', scheme: 'light', source: 'morhetz/gruvbox, MIT/X11' },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', scheme: 'light', source: 'rose-pine/palette, MIT' },
  { id: 'tokyo-night-day', name: 'Tokyo Night Day', scheme: 'light', source: 'folke/tokyonight.nvim, Apache-2.0' },
  { id: 'rudimeter-dark', name: 'Rudimeter Dark', scheme: 'dark', source: 'Rudimeter' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', scheme: 'dark', source: 'catppuccin/palette, MIT' },
  { id: 'tokyo-night', name: 'Tokyo Night', scheme: 'dark', source: 'folke/tokyonight.nvim, Apache-2.0' },
  { id: 'dracula', name: 'Dracula', scheme: 'dark', source: 'dracula/dracula-theme, MIT' },
  { id: 'nord', name: 'Nord', scheme: 'dark', source: 'nordtheme/nord, MIT' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', scheme: 'dark', source: 'morhetz/gruvbox, MIT/X11' },
  { id: 'one-dark', name: 'One Dark', scheme: 'dark', source: 'atom/one-dark-syntax, MIT' },
  { id: 'rose-pine', name: 'Rosé Pine', scheme: 'dark', source: 'rose-pine/palette, MIT' },
  { id: 'solarized-dark', name: 'Solarized Dark', scheme: 'dark', source: 'altercation/solarized, MIT' },
]

/** No theme stamped: Rudimeter Light, or Rudimeter Dark when the device is dark (themes.css). */
export type ThemeChoice = 'system' | Theme['id']

/**
 * The app's theme is not a view preference (`rudimeter.view`): it is every page's, and index.html
 * reads this key before the first paint — its inline script names it too (themes.test.ts checks).
 */
export const THEME_KEY = 'rudimeter.theme'

/** A known id, or System: a theme a later version dropped, a hand edit, another app's value. */
export function parseTheme(raw: string | null): ThemeChoice {
  return THEMES.some((t) => t.id === raw) ? (raw as string) : 'system'
}

/** `try`: in private Safari the storage throws, and the system's theme beats no page. */
export function loadTheme(store: KeyValueStore): ThemeChoice {
  try {
    return parseTheme(store.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

/** System is the absence of a choice: the key goes, so the boot script stamps nothing. */
export function saveTheme(store: KeyValueStore, choice: ThemeChoice): void {
  try {
    if (choice === 'system') store.removeItem(THEME_KEY)
    else store.setItem(THEME_KEY, choice)
  } catch {
    // The theme still applies for this visit; it is only not remembered.
  }
}
