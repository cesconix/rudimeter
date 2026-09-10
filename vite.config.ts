import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// basicSsl: HTTPS with a self-signed certificate. getUserMedia requires a secure context and the
// iPad reaches the Mac over its LAN IP, not localhost.
// The site is served from the root of rudimeter.com, so the default base ('/') is correct
// everywhere: dev, preview and Pages behind the custom domain.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
})
