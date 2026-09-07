import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl: HTTPS con certificato self-signed. Serve perché getUserMedia
// richiede un secure context e l'iPad raggiunge il Mac via IP LAN, non localhost.
// `--mode pages` (CI): l'app vive sotto /stick-coach/. Niente `process.env`: la modalità arriva da Vite, non dall'ambiente.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/stick-coach/' : '/',
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
