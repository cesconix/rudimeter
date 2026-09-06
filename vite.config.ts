import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// basicSsl: HTTPS con certificato self-signed. Serve perché getUserMedia
// richiede un secure context e l'iPad raggiunge il Mac via IP LAN, non localhost.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
