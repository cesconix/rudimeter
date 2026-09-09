import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './ui/styles.css'

// biome-ignore lint/style/noNonNullAssertion: #root is hardcoded in index.html; without it the app cannot boot and must fail loudly.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
