import { describe, expect, it } from 'bun:test'
import { lazySchema, storeUnavailable } from './ready'

describe('lazySchema', () => {
  it('runs the check once and hands the same answer to everyone after it', async () => {
    let calls = 0
    const ensure = lazySchema(async () => {
      calls++
    })
    await Promise.all([ensure(), ensure()])
    await ensure()
    expect(calls).toBe(1)
  })

  it('forgets a failure so the next request retries it, instead of failing for the life of the instance', async () => {
    let calls = 0
    const ensure = lazySchema(async () => {
      calls++
      // What Bun's SQL throws when Neon's compute is still waking up.
      if (calls === 1) throw new Error('Failed to connect')
    })
    await expect(ensure()).rejects.toThrow('Failed to connect')
    await ensure()
    expect(calls).toBe(2)
    // And once it works it is memoised again: the retry is for failures, not every request.
    await ensure()
    expect(calls).toBe(2)
  })
})

describe('storeUnavailable', () => {
  it('is a 5xx, because a 4xx would make the page throw the batch away', async () => {
    const res = storeUnavailable()
    expect(res.status).toBe(503)
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'store unavailable' })
  })
})
