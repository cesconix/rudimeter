import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Variante HTTP solo-localhost: Chrome tratta http://localhost come secure context,
// quindi getUserMedia funziona senza certificato. Per l'iPad usare vite.config.ts (HTTPS).
export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5174 },
})
