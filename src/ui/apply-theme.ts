import type { ThemeChoice } from './themes'

/**
 * Stamps the theme on <html> (System is no attribute: themes.css follows the device) and hands the
 * browser's chrome — Safari's bar, the home-screen app's status bar — the page's background. Only
 * CSS changes: nothing is re-engraved.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  syncThemeColor()
}

/** `theme-color` from the computed `--bg`: the one colour the page cannot paint itself. */
function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (meta && bg) meta.setAttribute('content', bg)
}

/** Once, at boot: in System the background turns with the device, and the chrome must turn with it. */
export function followSystemTheme(): void {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor)
}
