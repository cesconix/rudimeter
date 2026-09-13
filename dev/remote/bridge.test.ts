import { describe, expect, it } from 'bun:test'
import { linesFrom, requestFrom } from './bridge'

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
})

describe('linesFrom', () => {
  it('numbers from `first` and reads the event back, unknown when missing', () => {
    const lines = linesFrom({ first: 5, last: 6, raws: ['{"event":"hit","seq":5}', '{"seq":6}'] })
    expect(lines).toEqual([
      { seq: 5, event: 'hit', raw: '{"event":"hit","seq":5}' },
      { seq: 6, event: 'unknown', raw: '{"seq":6}' },
    ])
  })
})
