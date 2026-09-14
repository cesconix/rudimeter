// A response already in flight when close() runs must not resurrect anything after it: close()'s own
// final drain resolves strictly after `closed = true`, so an earlier flush's fetch is the one window
// where a caller-visible callback (`onName`) could still fire post-close. For a tester, `onName` writes
// the key back into storage (see App.tsx and src/telemetry/tester.ts) — so a late answer landing after
// Stop would silently undo it. `bun test` has no DOM (see src/notation/render.test.ts), so
// `window`/`document`/`fetch` are faked here just enough to drive `connectTelemetry` through that exact
// ordering, without a real timer or a real network call.
import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import { connectTelemetry, type TelemetryHandle } from './client'
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

/**
 * The retry path, driven through the same DOM fakes: what the client does with a batch the API refused
 * tells the tester's session apart from a lost one. A 4xx cannot succeed on a resend, so the batch has to
 * go; a 5xx or a dropped connection is the one case the retry machinery exists for.
 */
describe('connectTelemetry retry', () => {
  interface Fakes {
    bodies: string[]
    runFlush(): void
    status(code: number): void
  }

  /** Fakes `window`/`document`/`fetch` and silences `console.error`, restoring all four afterwards. */
  async function withFakes(run: (f: Fakes, t: TelemetryHandle) => Promise<void>): Promise<void> {
    const g = globalThis as { window?: unknown; document?: unknown; fetch?: unknown }
    const before = { window: g.window, document: g.document, fetch: g.fetch, error: console.error }
    let armed: (() => void) | null = null
    let code = 200
    const bodies: string[] = []
    g.window = {
      setTimeout: (fn: () => void) => {
        armed = fn
        return 1
      },
      clearTimeout: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    g.document = { addEventListener: () => {}, removeEventListener: () => {} }
    g.fetch = ((_url: unknown, init: { body: string }) => {
      bodies.push(init.body)
      return Promise.resolve({
        ok: code < 400,
        status: code,
        statusText: 'refused',
        json: async () => ({}),
      })
    }) as unknown as typeof fetch
    // The client logs every failure; the gate wants a silent run.
    console.error = () => {}
    const handle = connectTelemetry({ name: 'x', endpoint: () => `https://x.test/api/log?key=${KEY}`, flushMs: 1000 })
    try {
      await run(
        {
          bodies,
          runFlush: () => armed?.(),
          status: (c) => {
            code = c
          },
        },
        handle,
      )
    } finally {
      console.error = before.error
      if (before.window === undefined) delete g.window
      else g.window = before.window
      if (before.document === undefined) delete g.document
      else g.document = before.document
      if (before.fetch === undefined) delete g.fetch
      else g.fetch = before.fetch
    }
  }

  /** Enough turns for post()'s then/catch chain and the `inflight` reset behind it to settle. */
  const settle = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
  }

  it('drops a batch the API refused with a 4xx and posts a flush:drop in its place', async () => {
    await withFakes(async (f, t) => {
      f.status(413)
      t.log('hit', { i: 1 })
      f.runFlush()
      await settle()
      expect(f.bodies).toHaveLength(1)
      expect(f.bodies[0]).toContain('"i":1')
      t.log('hit', { i: 2 })
      f.runFlush()
      await settle()
      expect(f.bodies).toHaveLength(2)
      // The refused lines are gone for good, a `flush:drop` marks the hole they left, and the marker
      // that says "a batch was lost and is coming back" is not there, because it is not coming back.
      expect(f.bodies[1]).toContain('"event":"flush:drop"')
      expect(f.bodies[1]).toContain('"i":2')
      expect(f.bodies[1]).not.toContain('"i":1')
      expect(f.bodies[1]).not.toContain('flush:retry')
    })
  })

  it('requeues a batch the API failed with a 5xx and announces it with flush:retry', async () => {
    await withFakes(async (f, t) => {
      f.status(503)
      t.log('hit', { i: 1 })
      f.runFlush()
      await settle()
      expect(f.bodies[0]).toContain('"i":1')
      f.runFlush()
      await settle()
      expect(f.bodies).toHaveLength(2)
      expect(f.bodies[1]).toContain('"event":"flush:retry"')
      expect(f.bodies[1]).toContain('"i":1')
      expect(f.bodies[1]).not.toContain('flush:drop')
    })
  })
})
