import { beforeEach, describe, expect, it } from 'bun:test'
import {
  type Context,
  DEFAULT_LIMIT,
  handle,
  MAX_BATCH_LINES,
  MAX_BODY_BYTES,
  MAX_LIMIT,
  MAX_LINE_BYTES,
} from './handler'
import { memoryStore, type Store } from './store'

const TOKEN = 'secret-token'
const ORIGIN = 'https://rudimeter.test'

let store: Store
let ctx: Context
beforeEach(async () => {
  store = memoryStore()
  await store.ensureSchema()
  ctx = { store, adminToken: TOKEN }
})

const call = (
  method: string,
  path: string,
  init: { body?: string; headers?: Record<string, string>; admin?: boolean } = {},
) =>
  handle(
    new Request(`${ORIGIN}${path}`, {
      method,
      body: init.body,
      headers: { ...(init.admin ? { authorization: `Bearer ${TOKEN}` } : {}), ...(init.headers ?? {}) },
    }),
    ctx,
  )

describe('POST /api/log', () => {
  it('refuses an unknown or malformed key with 403 and writes nothing', async () => {
    expect((await call('POST', '/api/log?key=nope', { body: '{"event":"hello"}' })).status).toBe(403)
    expect((await call('POST', `/api/log?key=${'0'.repeat(32)}`, { body: '{"event":"hello"}' })).status).toBe(403)
  })
  it('numbers a batch for the device of the key, stamps seq/receivedAt, answers with name and last seq', async () => {
    const d = await store.createDevice('marco')
    const res = await call('POST', `/api/log?key=${d.key}`, { body: '{"event":"hello","ua":"x"}\n{"t":1.2}\n\n' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, name: 'marco', seq: 2 })
    const rows = await store.read(d.id, 0, 10)
    expect(JSON.parse(rows[0].line)).toMatchObject({ event: 'hello', ua: 'x', seq: 1 })
    expect(typeof JSON.parse(rows[0].line).receivedAt).toBe('string')
    // A line without a string `event` is kept, tagged 'unknown', like the plugin always did.
    expect(JSON.parse(rows[1].line)).toMatchObject({ t: 1.2, event: 'unknown', seq: 2 })
  })
  it('a malformed line, an array line or an empty batch is 400 and nothing of the batch lands', async () => {
    const d = await store.createDevice('marco')
    expect((await call('POST', `/api/log?key=${d.key}`, { body: '{"event":"a"}\n{oops' })).status).toBe(400)
    expect((await call('POST', `/api/log?key=${d.key}`, { body: '[1,2]' })).status).toBe(400)
    expect((await call('POST', `/api/log?key=${d.key}`, { body: '\n\n' })).status).toBe(400)
    expect(await store.lastSeq(d.id)).toBe(0)
  })
  it('caps the body, the batch and the line with 413', async () => {
    const d = await store.createDevice('marco')
    const many = Array.from({ length: MAX_BATCH_LINES + 1 }, () => '{"event":"hit"}').join('\n')
    expect((await call('POST', `/api/log?key=${d.key}`, { body: many })).status).toBe(413)
    const fat = JSON.stringify({ event: 'x', pad: 'p'.repeat(MAX_LINE_BYTES) })
    expect((await call('POST', `/api/log?key=${d.key}`, { body: fat })).status).toBe(413)
    const declared = await call('POST', `/api/log?key=${d.key}`, {
      body: '{"event":"x"}',
      headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
    })
    expect(declared.status).toBe(413)
    expect(await store.lastSeq(d.id)).toBe(0)
  })
})

describe('admin routes', () => {
  it('need the token as bearer or cookie', async () => {
    expect((await call('GET', '/api/devices')).status).toBe(401)
    expect((await call('GET', '/api/devices', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await call('GET', '/api/devices', { admin: true })).status).toBe(200)
    expect((await call('GET', '/api/devices', { headers: { cookie: `rudimeter_admin=${TOKEN}` } })).status).toBe(200)
  })
  it('a null token (dev server) opens them', async () => {
    ctx = { store, adminToken: null }
    expect((await call('GET', '/api/devices')).status).toBe(200)
  })
  it('GET /api/devices lists summaries without keys', async () => {
    await store.createDevice('marco')
    const list = (await (await call('GET', '/api/devices', { admin: true })).json()) as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'marco', lines: 0, lastSeq: 0 })
    expect('key' in list[0]).toBe(false)
  })
  it('POST /api/devices creates a device under a safe name and answers 201 with its key; 409 on a taken name; 400 without a name', async () => {
    const res = await call('POST', '/api/devices', { admin: true, body: JSON.stringify({ name: 'Marco Rossi' }) })
    expect(res.status).toBe(201)
    const made = (await res.json()) as { id: string; name: string; key: string }
    expect(made.name).toBe('marco-rossi')
    expect(made.key).toMatch(/^[0-9a-f]{32}$/)
    expect((await store.deviceByKey(made.key))?.id).toBe(made.id)
    expect(
      (await call('POST', '/api/devices', { admin: true, body: JSON.stringify({ name: 'marco-rossi' }) })).status,
    ).toBe(409)
    expect((await call('POST', '/api/devices', { admin: true, body: JSON.stringify({}) })).status).toBe(400)
    expect((await call('POST', '/api/devices', { admin: true, body: '{oops' })).status).toBe(400)
  })
  it('GET /api/lines streams NDJSON after `since`, with x-last-seq; 404 unknown device; 400 bad numbers', async () => {
    const d = await store.createDevice('marco')
    await store.append(d.id, [{ event: 'a' }, { event: 'b' }, { event: 'c' }], 'now')
    const res = await call('GET', '/api/lines?device=marco&since=1', { admin: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('x-last-seq')).toBe('3')
    const text = await res.text()
    expect(text.endsWith('\n')).toBe(true)
    expect(
      text
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l).event),
    ).toEqual(['b', 'c'])
    const limited = await call('GET', '/api/lines?device=marco&since=0&limit=1', { admin: true })
    expect(limited.headers.get('x-last-seq')).toBe('1')
    const empty = await call('GET', '/api/lines?device=marco&since=3', { admin: true })
    expect(await empty.text()).toBe('')
    expect(empty.headers.get('x-last-seq')).toBe('3')
    expect((await call('GET', '/api/lines?device=nobody', { admin: true })).status).toBe(404)
    expect((await call('GET', '/api/lines?device=marco&since=abc', { admin: true })).status).toBe(400)
  })
  it('defaults the page to DEFAULT_LIMIT and caps an oversized request at MAX_LIMIT instead of rejecting it', async () => {
    const d = await store.createDevice('marco')
    await store.append(d.id, [{ event: 'a' }, { event: 'b' }], 'now')
    const noLimit = await call('GET', '/api/lines?device=marco&since=0', { admin: true })
    const atDefault = await call('GET', `/api/lines?device=marco&since=0&limit=${DEFAULT_LIMIT}`, { admin: true })
    expect(await noLimit.text()).toBe(await atDefault.text())
    const overCap = await call('GET', `/api/lines?device=marco&since=0&limit=${MAX_LIMIT + 1}`, { admin: true })
    expect(overCap.status).toBe(200)
  })
  it('POST /api/feedback appends a dashboard comment to the named device', async () => {
    const d = await store.createDevice('marco')
    const body = JSON.stringify({ device: 'marco', sessionId: 'marco@2026-09-13T10:00:00.000Z', text: '  felt late  ' })
    const res = await call('POST', '/api/feedback', { admin: true, body })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, seq: 1 })
    const [row] = await store.read(d.id, 0, 1)
    expect(JSON.parse(row.line)).toMatchObject({
      event: 'session:feedback',
      sessionId: 'marco@2026-09-13T10:00:00.000Z',
      text: 'felt late',
      source: 'dashboard',
    })
    const bad = JSON.stringify({ device: 'marco', sessionId: 'ipad@2026-09-13T10:00:00.000Z', text: 'x' })
    expect((await call('POST', '/api/feedback', { admin: true, body: bad })).status).toBe(400)
    const nobody = JSON.stringify({ device: 'nobody', sessionId: 'nobody@2026-09-13T10:00:00.000Z', text: 'x' })
    expect((await call('POST', '/api/feedback', { admin: true, body: nobody })).status).toBe(404)
  })
  it('unknown routes: 401 without admin, 404 with', async () => {
    expect((await call('GET', '/api/nope')).status).toBe(401)
    expect((await call('GET', '/api/nope', { admin: true })).status).toBe(404)
  })
})

describe('login / logout', () => {
  it('sets the cookie on the right token, 401 otherwise, clears it on logout', async () => {
    const ok = await call('POST', '/api/login', { body: JSON.stringify({ token: TOKEN }) })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('set-cookie')).toContain(`rudimeter_admin=${TOKEN}; HttpOnly; Secure; SameSite=Strict`)
    expect((await call('POST', '/api/login', { body: JSON.stringify({ token: 'wrong' }) })).status).toBe(401)
    expect((await call('POST', '/api/login', { body: '{oops' })).status).toBe(400)
    const out = await call('POST', '/api/logout')
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})
