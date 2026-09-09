import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl: HTTPS with a self-signed certificate. getUserMedia requires a secure context and the
// iPad reaches the Mac over its LAN IP, not localhost.
// `--mode pages` (CI): the app lives under /stick-coach/. No `process.env`: the mode comes from Vite.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/stick-coach/' : '/',
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
}))
