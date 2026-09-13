// The page side of telemetry: a queue of JSON lines flushed in batches to an endpoint, with the retry
// and keepalive rules learnt on the dev channel (plan 05). Two callers: a tester's page in production
// (`/api/log?key=…`, one batch every 2 s) and the dev channel in src/dev/remote.ts (250 ms, SSE on top).
// No React, nothing from src/dev: App.tsx loads this as its own chunk, only on a page that has a key.

export interface Telemetry {
  /** The name the server settled on: the wanted one until its first answer, `…` for a tester before it. */
  name: string
  /**
   * Returns the ISO `at` it stamped into the line, or `null` when the channel is closed (nothing
   * logged): the session id the analysis derives is `<device>@<at of session:start>`, and only `log`
   * knows the `at` it wrote.
   */
  log(event: string, data?: Record<string, unknown>): string | null
  close(): void
}

export interface TelemetryHandle extends Telemetry {
  /** For a caller that learns the name before the first batch is answered: the dev channel's SSE hello. */
  settle(name: string): void
}

export interface TelemetryOptions {
  name: string
  /** Where batches go, key included; null while nothing may be sent yet (the dev channel before hello). Read at every flush. */
  endpoint: () => string | null
  flushMs: number
  onName?: (name: string) => void
}

/**
 * `/api/log?key=<key>`, the one endpoint every caller posts to. Kept here, not where a caller builds its
 * `endpoint()` (App.tsx's tester branch, dev/remote.ts): both load this module through a dynamic import,
 * so the literal path stays inside that one chunk instead of leaking into whatever bundle calls it.
 */
export function apiLogEndpoint(key: string): string {
  return `${location.origin}/api/log?key=${encodeURIComponent(key)}`
}

/**
 * A dead server must not grow the queue without bound: 5000 lines is ~8 minutes of the busiest traffic
 * seen (~10 `hit`/s plus 1 `output`/s) and a few hundred KB of strings. Past it the oldest go, counted.
 */
const MAX_QUEUE_LINES = 5000

export function connectTelemetry(opts: TelemetryOptions): TelemetryHandle {
  const queue: string[] = []
  let name = opts.name
  let timer: number | null = null
  // Set once `close()` has run its final flush: `log`/`flush` become no-ops so a call arriving after
  // close (e.g. a late `cmd:done`) cannot resurrect the queue or schedule a stray `fetch` to `/log`.
  let closed = false
  /** The batch the timer path has on the wire, so it never puts a second one next to it. */
  let inflight: Promise<void> | null = null
  /** Why the last batch failed, until a batch gets through and reports it as `flush:retry`. */
  let failure: string | null = null
  let requeued = 0
  let dropped = 0

  function arm(): void {
    if (!closed && timer === null) timer = window.setTimeout(() => flush(), opts.flushMs)
  }

  function trim(): void {
    if (queue.length > MAX_QUEUE_LINES) dropped += queue.splice(0, queue.length - MAX_QUEUE_LINES).length
  }

  function requeue(batch: string[], reason: string): void {
    queue.unshift(...batch)
    requeued += batch.length
    failure = reason
    trim()
    console.error(`[remote] log batch failed, requeued: ${reason}`)
    arm()
  }

  function settle(settled: string): void {
    if (settled === name) return
    name = settled
    opts.onName?.(settled)
  }

  function post(batch: string[], keepalive: boolean, endpoint: string): Promise<void> {
    // The gap the retry left in the file is itself a line, so the analysis can see it instead of
    // reading a session that starts in the middle of nowhere.
    const body =
      failure === null
        ? batch
        : [
            JSON.stringify({
              event: 'flush:retry',
              at: new Date().toISOString(),
              perf: Math.round(performance.now()),
              lines: requeued,
              dropped,
              error: failure,
            }),
            ...batch,
          ]
    return fetch(endpoint, { method: 'POST', body: body.join('\n'), keepalive })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        failure = null
        requeued = 0
        dropped = 0
        // The answer names the device: a tester only has a key, and this is where its name comes from.
        const data = (await res.json().catch(() => ({}))) as { name?: unknown }
        if (typeof data.name === 'string') settle(data.name)
      })
      .catch((err: unknown) => {
        requeue(batch, (err as Error).message)
      })
  }

  /**
   * `keepalive` is not free: Chrome caps the sum of the bodies of all in-flight keepalive requests at
   * 64 KiB per document, and the session-start burst is ~63 KB (`session:start` 21.6 KB + `session:truth`
   * 10 KB, twice under React StrictMode, plus `cmd:done` and `screen`). With any earlier batch still on
   * the wire the fetch rejects outright and the whole batch is gone — which is how `.remote/synth.ndjson`
   * ended up with a `session:done` and no `session:start`. So the timer path sends a plain fetch and keeps
   * a single batch in flight; only the hide/close path, which cannot wait for anything, asks for keepalive.
   */
  function flush(keepalive = false): void {
    timer = null
    if (closed || queue.length === 0) return
    const endpoint = opts.endpoint()
    if (endpoint === null) return
    if (!keepalive && inflight) {
      // File order is what the analysis reads back: two overlapping POSTs can land either way round.
      arm()
      return
    }
    const done = post(queue.splice(0), keepalive, endpoint)
    if (keepalive) return
    inflight = done.then(() => {
      inflight = null
    })
  }

  function log(event: string, data: Record<string, unknown> = {}): string | null {
    if (closed) return null
    const at = new Date().toISOString()
    queue.push(JSON.stringify({ event, at, perf: Math.round(performance.now()), ...data }))
    trim()
    arm()
    return at
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush(true)
  }
  document.addEventListener('visibilitychange', onHide)

  const onPageHide = () => {
    close()
  }
  window.addEventListener('pagehide', onPageHide)

  function close(): void {
    // Cancel the debounce timer by its real id before `flush()` (which unconditionally nulls the
    // `timer` variable itself) would lose it: an uncancelled native timeout still fires later.
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    flush(true) // final drain, while `closed` is still false so it actually sends
    closed = true
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onPageHide)
  }

  return {
    get name() {
      return name
    },
    log,
    close,
    settle,
  }
}
