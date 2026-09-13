// The production API, as a plain `(Request) => Response`: `api/server.ts` wraps it in `Bun.serve` on
// Vercel, `dev/remote/plugin.ts` mounts it under Vite on the Mac, the tests call it with `new Request`.
// It is deliberately dumb — it stores lines and hands them back; every number the dashboard shows is
// computed from the lines by `src/analysis`, in the browser or in the CLI, never here.
import { loginCookie, logoutCookie, principal, sameToken } from './auth'
import { parseFeedbackBody } from './feedback'
import { isKey, safeName } from './names'
import { NameTakenError, type Store } from './store'

export interface Context {
  store: Store
  /** null only under the Vite plugin: there, everyone is admin. */
  adminToken: string | null
}

/** A tester's page sends a batch every 2 s; the biggest single line seen is `session:start` at 21.6 KB. */
export const MAX_BODY_BYTES = 1024 * 1024
export const MAX_BATCH_LINES = 5000
export const MAX_LINE_BYTES = 64 * 1024
export const DEFAULT_LIMIT = 5000
export const MAX_LIMIT = 20000

const json = (status: number, data: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

/** null when the body is over `cap`, by its declared length or its real one. */
async function bodyText(req: Request, cap: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > cap) return null
  const text = await req.text()
  return Buffer.byteLength(text) > cap ? null : text
}

async function bodyJson(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const body = JSON.parse((await bodyText(req, MAX_BODY_BYTES)) ?? '') as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return { ok: false, error: 'body must be a JSON object' }
    return { ok: true, body: body as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: `malformed JSON: ${(err as Error).message}` }
  }
}

export async function handle(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  try {
    if (req.method === 'POST' && path === '/api/log') return await log(req, url, ctx)
    if (req.method === 'POST' && path === '/api/login') return await login(req, ctx)
    if (req.method === 'POST' && path === '/api/logout')
      return new Response(null, { status: 204, headers: { 'set-cookie': logoutCookie() } })
    if (principal(req, ctx.adminToken) !== 'admin') return json(401, { error: 'admin token required' })
    if (req.method === 'GET' && path === '/api/devices') return json(200, await ctx.store.devices())
    if (req.method === 'POST' && path === '/api/devices') return await createDevice(req, ctx)
    if (req.method === 'GET' && path === '/api/lines') return await lines(url, ctx)
    if (req.method === 'POST' && path === '/api/feedback') return await feedback(req, ctx)
    return json(404, { error: `unknown route ${req.method} ${path}` })
  } catch (err) {
    return json(500, { error: (err as Error).message })
  }
}

async function log(req: Request, url: URL, ctx: Context): Promise<Response> {
  const key = url.searchParams.get('key') ?? ''
  // One answer for a malformed and for an unknown key: the response must not say which names exist.
  const device = isKey(key) ? await ctx.store.deviceByKey(key) : null
  if (!device) return json(403, { error: 'unknown device key' })
  const text = await bodyText(req, MAX_BODY_BYTES)
  if (text === null) return json(413, { error: `body over ${MAX_BODY_BYTES} bytes` })
  const raws = text.split('\n').filter((r) => r.trim())
  if (raws.length === 0) return json(400, { error: 'empty batch' })
  if (raws.length > MAX_BATCH_LINES)
    return json(413, { error: `${raws.length} lines in one batch (max ${MAX_BATCH_LINES})` })
  // Parse the whole batch before storing any line: a line that fails must abort before an earlier
  // one in the same batch gets a `seq` the file would then carry without the rest.
  const fields: Record<string, unknown>[] = []
  for (const [i, raw] of raws.entries()) {
    if (Buffer.byteLength(raw) > MAX_LINE_BYTES)
      return json(413, { error: `line ${i + 1} over ${MAX_LINE_BYTES} bytes` })
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return json(400, { error: `malformed JSON on line ${i + 1}: ${(err as Error).message}` })
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return json(400, { error: `line ${i + 1} is not a JSON object` })
    const f = parsed as Record<string, unknown>
    fields.push(typeof f.event === 'string' ? f : { ...f, event: 'unknown' })
  }
  const { last } = await ctx.store.append(device.id, fields, new Date().toISOString())
  return json(200, { ok: true, name: device.name, seq: last })
}

async function login(req: Request, ctx: Context): Promise<Response> {
  const parsed = await bodyJson(req)
  if (!parsed.ok) return json(400, { error: parsed.error })
  const token = typeof parsed.body.token === 'string' ? parsed.body.token : ''
  if (ctx.adminToken === null) return new Response(null, { status: 204 })
  if (!sameToken(token, ctx.adminToken)) return json(401, { error: 'wrong token' })
  return new Response(null, { status: 204, headers: { 'set-cookie': loginCookie(ctx.adminToken) } })
}

async function createDevice(req: Request, ctx: Context): Promise<Response> {
  const parsed = await bodyJson(req)
  if (!parsed.ok) return json(400, { error: parsed.error })
  if (typeof parsed.body.name !== 'string' || !parsed.body.name.trim())
    return json(400, { error: 'name must be a non-empty string' })
  try {
    const d = await ctx.store.createDevice(safeName(parsed.body.name))
    return json(201, { id: d.id, name: d.name, key: d.key })
  } catch (err) {
    if (err instanceof NameTakenError) return json(409, { error: err.message })
    throw err
  }
}

async function lines(url: URL, ctx: Context): Promise<Response> {
  const name = url.searchParams.get('device') ?? ''
  const since = Number(url.searchParams.get('since') ?? 0)
  const limit = Math.min(MAX_LIMIT, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT))
  if (!Number.isInteger(since) || since < 0 || !Number.isInteger(limit) || limit < 1)
    return json(400, { error: 'since and limit must be non-negative integers' })
  const device = await ctx.store.deviceByName(name)
  if (!device) return json(404, { error: `unknown device "${name}"` })
  const rows = await ctx.store.read(device.id, since, limit)
  const lastSeq = rows.length ? rows[rows.length - 1].seq : since
  const body = rows.length ? `${rows.map((r) => r.line).join('\n')}\n` : ''
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-last-seq': String(lastSeq) },
  })
}

async function feedback(req: Request, ctx: Context): Promise<Response> {
  const parsed = await bodyJson(req)
  if (!parsed.ok) return json(400, { error: parsed.error })
  const name = typeof parsed.body.device === 'string' ? parsed.body.device : ''
  const device = await ctx.store.deviceByName(name)
  if (!device) return json(404, { error: `unknown device "${name}"` })
  const fb = parseFeedbackBody(parsed.body, device.name)
  if (!fb.ok) return json(400, { error: fb.error })
  const { last } = await ctx.store.append(
    device.id,
    [
      {
        event: 'session:feedback',
        at: new Date().toISOString(),
        sessionId: fb.sessionId,
        text: fb.text,
        source: 'dashboard',
      },
    ],
    new Date().toISOString(),
  )
  return json(200, { ok: true, seq: last })
}
