import { describe, expect, it, spyOn } from 'bun:test'
import { createClient, defaultUntil, parseArgs } from './client'

describe('parseArgs', () => {
  it('command, json args and flags', () => {
    expect(
      parseArgs(['--to', 'iphone', 'start', '{"exercise":"stone-1","bpm":60}', '--until', 'session:done']),
    ).toEqual({
      to: 'iphone',
      all: false,
      cmd: 'start',
      args: { exercise: 'stone-1', bpm: 60 },
      until: 'session:done',
      timeoutMs: 60000,
      n: null,
      export: null,
      remote: false,
      as: null,
      renumber: false,
      force: false,
    })
  })
  it('rejects unknown flags and bad json', () => {
    expect(() => parseArgs(['--target', 'x', 'ping'])).toThrow('unknown flag "--target"')
    expect(() => parseArgs(['start', '{oops'])).toThrow('args must be JSON')
  })
  it('ls, tail and wait are commands too', () => {
    expect(parseArgs(['ls']).cmd).toBe('ls')
    expect(parseArgs(['tail', 'ipad', '--n', '10'])).toMatchObject({ cmd: 'tail', args: { name: 'ipad' }, n: 10 })
    expect(parseArgs(['wait', 'session:done', '--timeout', '600000'])).toMatchObject({
      cmd: 'wait',
      args: { event: 'session:done' },
      timeoutMs: 600000,
    })
  })
  it('report/verdict/calibrations take a device name, not JSON', () => {
    expect(parseArgs(['report', 'iphone', '--n', '3'])).toMatchObject({ cmd: 'report', args: { name: 'iphone' }, n: 3 })
    expect(parseArgs(['verdict'])).toMatchObject({ cmd: 'verdict', args: {} })
  })
  it('feedback takes a device name, --n and --export; --n is null unless given', () => {
    expect(parseArgs(['feedback'])).toMatchObject({ cmd: 'feedback', args: {}, n: null, export: null })
    expect(parseArgs(['feedback', 'iphone', '--n', '3', '--export', 'docs/plans/feedback.md'])).toMatchObject({
      cmd: 'feedback',
      args: { name: 'iphone' },
      n: 3,
      export: 'docs/plans/feedback.md',
    })
    expect(() => parseArgs(['feedback', '--export'])).toThrow('--export needs a value')
  })
  it('reads the store commands and their flags', () => {
    expect(parseArgs(['devices', 'add', 'Marco', '--remote'])).toMatchObject({
      cmd: 'devices',
      args: { sub: 'add', name: 'Marco' },
      remote: true,
    })
    expect(parseArgs(['devices', 'ls'])).toMatchObject({ args: { sub: 'ls', name: null }, remote: false })
    expect(() => parseArgs(['devices', 'rm', 'x'])).toThrow('usage')
    expect(parseArgs(['export', 'iphone', '/tmp/x.ndjson', '--force'])).toMatchObject({
      args: { name: 'iphone', path: '/tmp/x.ndjson' },
      force: true,
    })
    expect(parseArgs(['import', 'f.ndjson', '--as', 'iphone', '--renumber'])).toMatchObject({
      args: { file: 'f.ndjson' },
      as: 'iphone',
      renumber: true,
    })
    expect(() => parseArgs(['import', 'f.ndjson'])).toThrow('--as')
    expect(parseArgs(['sync'])).toMatchObject({ cmd: 'sync', args: {} })
    expect(parseArgs(['report', 'ipad', '--remote'])).toMatchObject({ args: { name: 'ipad' }, remote: true })
  })
})

describe('defaultUntil', () => {
  it('waits for the event each command produces', () => {
    expect(defaultUntil('calibrate')).toBe('calibration:done,calibration:failed')
    expect(defaultUntil('start')).toBe('session:start')
    expect(defaultUntil('stop')).toBe('session:done')
    expect(defaultUntil('record')).toBe('audio')
    expect(defaultUntil('ping')).toBe('cmd:done')
  })
})

// `waitFor` and `send` are exercised against an injected fake fetch: no real dev server, no real
// sleeps beyond the deliberately-short timeout case below.
describe('waitFor', () => {
  it('polls again after a 204, clipping each slice to what is left, and returns the next line', async () => {
    // Date.now() is mocked, not slept: the fake fetch itself advances the clock by 20000 ms after
    // the first call, standing in for the 20 s the server would actually have blocked on `/wait`.
    let now = 1_000_000
    const nowSpy = spyOn(Date, 'now').mockImplementation(() => now)
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      if (calls.length === 1) {
        now += 20000
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ event: 'session:done', seq: 5 }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const client = createClient('https://x', fetchImpl)
      const line = await client.waitFor('fake', 'session:done', 2, 25000)
      expect(line).toEqual({ event: 'session:done', seq: 5 })
      expect(calls).toHaveLength(2)
      expect(calls[0]).toContain('after=2')
      expect(calls[0]).toContain('timeoutMs=20000') // first slice: capped at the 20 s server cap
      expect(calls[1]).toContain('timeoutMs=5000') // second slice: clipped to what remained of the 25 s budget
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('rejects with a timeout error once the deadline passes', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch
    const client = createClient('https://x', fetchImpl)
    await expect(client.waitFor('fake', 'session:done', 0, 30)).rejects.toThrow(
      'timeout after 30 ms waiting for "session:done" from fake',
    )
  })

  it('rejects when the server returns a cmd:error line', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ event: 'cmd:error', error: 'boom' }), { status: 200 })) as unknown as typeof fetch
    const client = createClient('https://x', fetchImpl)
    await expect(client.waitFor('fake', 'session:done', 0, 1000)).rejects.toThrow('fake: boom')
  })
})

describe('send', () => {
  it('posts cmd, args and target as JSON to /__remote/cmd and returns the parsed response', async () => {
    let seenUrl = ''
    let seenInit: RequestInit | undefined
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seenUrl = url
      seenInit = init
      return new Response(JSON.stringify({ id: 7, delivered: ['iphone'], seq: { iphone: 3 } }), { status: 200 })
    }) as unknown as typeof fetch
    const client = createClient('https://x', fetchImpl)
    const sent = await client.send('ping', {}, { to: 'iphone' })
    expect(sent).toEqual({ id: 7, delivered: ['iphone'], seq: { iphone: 3 } })
    expect(seenUrl).toBe('https://x/__remote/cmd')
    expect(seenInit?.method).toBe('POST')
    expect(JSON.parse(String(seenInit?.body))).toEqual({ cmd: 'ping', args: {}, to: 'iphone' })
  })
})
