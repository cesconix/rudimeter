// A response already in flight when close() runs must not resurrect anything after it: close()'s own
// final drain resolves strictly after `closed = true`, so an earlier flush's fetch is the one window
// where a caller-visible callback (`onName`) could still fire post-close. For a tester, `onName` writes
// the key back into storage (see App.tsx and src/telemetry/tester.ts) — so a late answer landing after
// Stop would silently undo it. `bun test` has no DOM (see src/notation/render.test.ts), so
// `window`/`document`/`fetch` are faked here just enough to drive `connectTelemetry` through that exact
// ordering, without a real timer or a real network call.
import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import { connectTelemetry } from './client'
import { forgetTester, readTester, rememberTester } from './tester'

const KEY = 'a'.repeat(32)

describe('connectTelemetry', () => {
  it('a batch already in flight before close() must not settle a name or undo a Stop already cleared', async () => {
    const g = globalThis as { window?: unknown; document?: unknown; fetch?: unknown }
    const previousWindow = g.window
    const previousDocument = g.document
    const previousFetch = g.fetch
    // Captured, not scheduled: the test decides exactly when the queued flush runs, instead of racing
    // a real timer, so the fetch it triggers is deterministically still pending when close() runs.
    const captured: { flush: (() => void) | null; resolve: ((res: unknown) => void) | null } = {
      flush: null,
      resolve: null,
    }
    g.window = {
      setTimeout: (fn: () => void) => {
        captured.flush = fn
        return 1
      },
      clearTimeout: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    g.document = { addEventListener: () => {}, removeEventListener: () => {} }
    g.fetch = (() =>
      new Promise((resolve) => {
        captured.resolve = resolve
      })) as unknown as typeof fetch
    try {
      const storage = memoryStore()
      rememberTester(storage, { key: KEY, name: null })
      let settledName: string | null = null
      const handle = connectTelemetry({
        name: '…',
        endpoint: () => `https://x.test/api/log?key=${KEY}`,
        flushMs: 1000,
        onName: (n) => {
          settledName = n
          rememberTester(storage, { key: KEY, name: n })
        },
      })
      handle.log('hello')
      captured.flush?.() // runs the queued flush synchronously: the fetch below is now in flight, unresolved
      // Stop: the key is forgotten and the client is closed while that fetch is still on the wire.
      forgetTester(storage)
      handle.close()
      expect(readTester('', storage)).toBeNull()
      // The batch sent before Stop is answered only now, after close().
      captured.resolve?.({ ok: true, status: 200, statusText: 'OK', json: async () => ({ name: 'chrome' }) })
      // Two ticks: one for `.then(async res => ...)` to run up to `await res.json()`, one for that
      // await and the `settle()` it guards to resolve.
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(settledName).toBeNull()
      expect(readTester('', storage)).toBeNull()
    } finally {
      if (previousWindow === undefined) delete g.window
      else g.window = previousWindow
      if (previousDocument === undefined) delete g.document
      else g.document = previousDocument
      if (previousFetch === undefined) delete g.fetch
      else g.fetch = previousFetch
    }
  })
})
