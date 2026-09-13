// The production API: one Bun server, one Vercel Function (`vercel.json` rewrites `/api/*` here). No
// Vercel API inside: the same file runs on any host with Bun, and `bun run api` runs it on the Mac
// against the Neon `preview` branch named in `.env.local`.
import { handle } from './_lib/handler'
import { sqlStore } from './_lib/store'

const url = process.env.DATABASE_URL
const adminToken = process.env.DASHBOARD_TOKEN
if (!url) throw new Error('DATABASE_URL is not set')
// Fail closed: without a token every read route would be open to the world.
if (!adminToken) throw new Error('DASHBOARD_TOKEN is not set')

const store = sqlStore(url)
// Once per process: Vercel keeps the instance warm across invocations, so this is a cold-start cost only.
const ready = store.ensureSchema()

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: async (req) => {
    await ready
    return handle(req, { store, adminToken })
  },
})
