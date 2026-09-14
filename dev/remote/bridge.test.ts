import { describe, expect, it } from 'bun:test'
import { applyHeaders, linesFrom, requestFrom } from './bridge'

describe('requestFrom', () => {
  it('keeps method, path, query and headers, drops host/connection/content-length, no body on GET', async () => {
    const r = requestFrom(
      {
        method: 'GET',
        url: '/api/lines?device=a&since=2',
        headers: { host: 'x', cookie: 'rudimeter_admin=t', 'content-length': '9' },
      },
      new TextEncoder().encode('ignored'),
    )
    expect(r.method).toBe('GET')
    expect(new URL(r.url).pathname).toBe('/api/lines')
    expect(new URL(r.url).searchParams.get('since')).toBe('2')
    expect(r.headers.get('cookie')).toBe('rudimeter_admin=t')
    expect(r.headers.get('host')).not.toBe('x')
    expect(await r.text()).toBe('')
  })
  it('carries the body on POST and joins repeated headers', async () => {
    const r = requestFrom(
      { method: 'POST', url: '/api/log?key=k', headers: { 'x-a': ['1', '2'] } },
      new TextEncoder().encode('{"event":"hello"}'),
    )
    expect(r.headers.get('x-a')).toBe('1, 2')
    expect(await r.text()).toBe('{"event":"hello"}')
  })
  it('drops HTTP/2 pseudo-headers instead of throwing on `Headers`', () => {
    const call = () =>
      requestFrom(
        {
          method: 'GET',
          url: '/api/devices',
          headers: {
            ':method': 'GET',
            ':path': '/api/devices',
            ':scheme': 'https',
            ':authority': 'localhost:5173',
            cookie: 'rudimeter_admin=t',
          },
        },
        undefined,
      )
    expect(call).not.toThrow()
    const r = call()
    expect([...r.headers.keys()].some((k) => k.startsWith(':'))).toBe(false)
    expect(r.headers.get('cookie')).toBe('rudimeter_admin=t')
  })
})

describe('applyHeaders', () => {
  it('sends every `set-cookie` value and leaves ordinary headers unchanged', () => {
    const response = new Response(null, {
      headers: [
        ['content-type', 'application/json'],
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
      ],
    })
    const sent: Record<string, string | string[]> = {}
    applyHeaders({ setHeader: (k, v) => (sent[k] = v) }, response)
    expect(sent['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(sent['content-type']).toBe('application/json')
  })
  it('does not call `setHeader` for `set-cookie` when there is none', () => {
    const response = new Response(null, { headers: { 'content-type': 'text/plain' } })
    const names: string[] = []
    applyHeaders({ setHeader: (k) => names.push(k) }, response)
    expect(names).not.toContain('set-cookie')
  })
})

describe('linesFrom', () => {
  it('numbers from `first` and reads the event back, unknown when missing', () => {
    const lines = linesFrom({
      first: 5,
      last: 6,
      raws: ['{"event":"hit","seq":5}', '{"seq":6}'],
      duplicate: false,
    })
    expect(lines).toEqual([
      { seq: 5, event: 'hit', raw: '{"event":"hit","seq":5}' },
      { seq: 6, event: 'unknown', raw: '{"seq":6}' },
    ])
  })
})
