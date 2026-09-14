// The arithmetic between the page's queue and the API's batch ceiling, which neither root can check on
// its own: `src/**` may not import `api/**` and `api/**` may not import the client, so the two constants
// were independent guesses until this file. `dev/**` may import anything, which is why it lives here.
//
// They were both 5000. The retry path prepends a `flush:retry` line, so a full queue shipped 5001 lines,
// `/api/log` answered 413, the client requeued the identical batch and prepended the marker again: a
// permanent 413 that destroyed the session it was retrying, line by line, for the life of the tab.
import { describe, expect, it } from 'bun:test'
import { type Context, handle, MAX_BATCH_LINES } from '../api/_lib/handler'
import { memoryStore } from '../api/_lib/store'
import { MAX_QUEUE_LINES } from '../src/telemetry/client'

const retryMarker = JSON.stringify({ event: 'flush:retry', at: 'now', perf: 0, lines: 1, dropped: 0, error: '500' })
const logLine = (i: number) => JSON.stringify({ event: 'hit', at: 'now', perf: i, t: i / 10, peakDb: -20 })

describe('the page queue against the API batch cap', () => {
  it('leaves room for the retry marker: a full queue is strictly under the batch ceiling', () => {
    expect(MAX_QUEUE_LINES + 1).toBeLessThanOrEqual(MAX_BATCH_LINES)
  })

  it('accepts a full queue plus the retry marker, the body the retry path actually sends', async () => {
    const store = memoryStore()
    await store.ensureSchema()
    const ctx: Context = { store, adminToken: 'secret-token' }
    const d = await store.createDevice('marco')
    const body = [retryMarker, ...Array.from({ length: MAX_QUEUE_LINES }, (_, i) => logLine(i))].join('\n')
    const res = await handle(new Request(`https://rudimeter.test/api/log?key=${d.key}`, { method: 'POST', body }), ctx)
    expect(res.status).toBe(200)
    expect(await store.lastSeq(d.id)).toBe(MAX_QUEUE_LINES + 1)
  })
})
