import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { remotePlugin } from './dev/remote/plugin'

// The commit the bundle was built from: Vercel names it in the environment, a local build asks git.
function commit(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    (() => {
      try {
        return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim()
      } catch {
        return 'unknown'
      }
    })()
  return sha.slice(0, 7)
}
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

// basicSsl: HTTPS with a self-signed certificate. getUserMedia requires a secure context and the
// iPad reaches the Mac over its LAN IP, not localhost.
// The site is served from the root of rudimeter.com, so the default base ('/') is correct
// everywhere: dev, preview and the Vercel deployment all serve from '/'.
// remotePlugin: `/__remote/*`, dev server only (see dev/remote/plugin.ts).
export default defineConfig({
  plugins: [react(), basicSsl(), remotePlugin()],
  server: { host: true, port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit()) },
})
