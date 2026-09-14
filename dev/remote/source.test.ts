import { describe, expect, it } from 'bun:test'
import { type Context, handle, MAX_LIMIT } from '../../api/_lib/handler'
import { memoryStore } from '../../api/_lib/store'
import { DEV_DB, httpSource, localSource } from './source'

describe('DEV_DB', () => {
  it('is the dev store path documented in README.md and AGENTS.md: a silent move should break this, not just a mental model', () => {
    expect(DEV_DB).toBe('.remote/dev.db')
  })
})

describe('localSource', () => {
  it('reads every line of a device across pages, [] for an unknown one', async () => {
    const store = memoryStore()
    const d = await store.createDevice('a')
    await store.append(
      d.id,
      [1, 2, 3, 4, 5].map((i) => ({ event: 'e', i })),
      'now',
    )
    const src = localSource(store, 2)
    expect((await src.lines('a')).map((r) => r.seq)).toEqual([1, 2, 3, 4, 5])
    expect((await src.lines('a', 3)).map((r) => r.seq)).toEqual([4, 5])
    expect(await src.lines('nobody')).toEqual([])
    expect((await src.devices()).map((x) => x.name)).toEqual(['a'])
  })
})

describe('httpSource', () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const line = (seq: number) => JSON.stringify({ event: 'e', seq })
  // Bun's `typeof fetch` also carries a static `preconnect`: a plain async function lacks it, so the
  // assignment goes through `unknown`, same as the fakes in client.test.ts.
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/api/devices') && init?.method === 'POST')
      return Response.json(
        { id: 'id1', name: JSON.parse(String(init.body)).name, key: 'k'.repeat(32) },
        { status: 201 },
      )
    if (url.endsWith('/api/devices')) return Response.json([{ id: 'id1', name: 'a', lines: 3 }])
    if (url.includes('device=nobody')) return Response.json({ error: 'unknown device' }, { status: 404 })
    if (url.includes('since=0')) return new Response(`${line(1)}\n${line(2)}\n`)
    // A short page, then an empty one: short is what the API sends when it clamps `limit`, so only the
    // empty response ends the paging.
    if (url.includes('since=2')) return new Response(`${line(3)}\n`)
    if (url.includes('since=3')) return new Response('')
    return Response.json({ error: 'boom' }, { status: 500 })
  }) as unknown as typeof fetch
  const src = httpSource('https://r.test', 'tok', fake, 2)

  it('sends the bearer token, pages by the last seq until a page is empty, [] on 404', async () => {
    calls.length = 0
    expect((await src.lines('a')).map((r) => r.seq)).toEqual([1, 2, 3])
    expect(calls.map((c) => new URL(c.url).searchParams.get('since'))).toEqual(['0', '2', '3'])
    // biome-ignore lint/correctness/noUnsafeOptionalChaining: fetchImpl always sets init on every call this source makes, so init is never undefined here.
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer tok')
    expect(await src.lines('nobody')).toEqual([])
  })
  it('lists devices and creates one, surfacing the server error message otherwise', async () => {
    expect((await src.devices()).map((d) => d.name)).toEqual(['a'])
    expect((await src.createDevice('marco')).name).toBe('marco')
    expect(src.lines('a', 7)).rejects.toThrow('boom')
  })
})

describe('httpSource against the real handler', () => {
  it('reads a long device whole even though /api/lines clamps the page it asked for', async () => {
    const store = memoryStore()
    await store.ensureSchema()
    const d = await store.createDevice('marco')
    const total = MAX_LIMIT + 3
    await store.append(
      d.id,
      Array.from({ length: total }, (_, i) => ({ event: 'hit', i })),
      'now',
    )
    const ctx: Context = { store, adminToken: 'tok' }
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(new Request(String(input), init), ctx)) as unknown as typeof fetch
    // Asks for more than the API will serve, the way a client whose PAGE drifted above MAX_LIMIT would:
    // every page comes back short of what was asked, and none of them but the last is the end.
    const src = httpSource('https://r.test', 'tok', fetchImpl, MAX_LIMIT + 500)
    const rows = await src.lines('marco')
    expect(rows.length).toBe(total)
    expect(rows[rows.length - 1].seq).toBe(total)
  })
})
