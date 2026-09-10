import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// basicSsl: HTTPS with a self-signed certificate. getUserMedia requires a secure context and the
// iPad reaches the Mac over its LAN IP, not localhost.
// `--mode pages` (CI): the app lives under /rudimeter/. No `process.env`: the mode comes from Vite.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/rudimeter/' : '/',
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
}))
