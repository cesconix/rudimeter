import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { applyTheme, followSystemTheme } from './ui/apply-theme'
import { loadTheme, saveTheme } from './ui/themes'
import './ui/themes.css'
import './ui/styles.css'
import './ui/score.css'

// index.html has stamped the saved theme already; this clears an id no version knows any more —
// from the page and from the storage, so the next boot stamps nothing wrong — and gives the
// browser's chrome the page's background.
const theme = loadTheme(localStorage)
saveTheme(localStorage, theme)
applyTheme(theme)
followSystemTheme()

// biome-ignore lint/style/noNonNullAssertion: #root is hardcoded in index.html; without it the app cannot boot and must fail loudly.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
