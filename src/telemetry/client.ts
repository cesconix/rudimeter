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
 * A dead server must not grow the queue without bound: 2000 lines is ~3 minutes of the busiest traffic
 * seen (~10 `hit`/s plus 1 `output`/s) and a few hundred KB of strings. Past it the oldest go, counted.
 *
 * It has to stay strictly below the API's `MAX_BATCH_LINES` with room for the `flush:retry` line `post()`
 * prepends. Both were 5000, chosen independently, so a full queue shipped 5001 lines and `/api/log`
 * answered 413 — forever, since the retry path re-prepends the marker on every attempt, destroying the
 * very session it was retrying. The import rules stop `src/` from reading the API's constant, so
 * `dev/telemetry-caps.test.ts` — the one root allowed to see both — owns the arithmetic between them.
 */
export const MAX_QUEUE_LINES = 2000

/** A batch that failed, as its own record: whose failure it is, how big it is, and why. */
interface Pending {
  id: string
  lines: number
  error: string
}

export function connectTelemetry(opts: TelemetryOptions): TelemetryHandle {
  const queue: string[] = []
  let name = opts.name
  let timer: number | null = null
  // Set once `close()` has run its final flush: `log`/`flush` become no-ops so a call arriving after
  // close (e.g. a late `cmd:done`) cannot resurrect the queue or schedule a stray `fetch` to `/log`.
  let closed = false
  /** The batch the timer path has on the wire, so it never puts a second one next to it. */
  let inflight: Promise<void> | null = null
  let requeued = 0
  let dropped = 0
  /**
   * Names a batch across its retries, so `/api/log` can tell "I never saw this" from "I stored it and
   * the answer was lost". Random per page and counted within it: two tabs of the same device never
   * collide, and nothing here has to survive a reload — a batch never outlives the page that made it.
   */
  const pageId = crypto.randomUUID().slice(0, 8)
  let batches = 0
  /**
   * The batches that failed and are waiting at the head of the queue, oldest first: each keeps the id it
   * was sent under, how many of its lines are still queued, and why it failed. A batch goes back out
   * exactly as it was — merging the lines logged since into it would put them under an id the store may
   * already have, and they would be dropped as a duplicate of lines they were never part of.
   *
   * A batch on the wire holds no entry here: `flush()` takes its entry out and `requeue()` puts it back.
   * That is what keeps one batch from clearing another's failure — the keepalive path bypasses the
   * in-flight guard, so a hidden tab really can have two batches out at once, and a batch that landed
   * used to null this slot whoever had filled it. The forgotten batch's lines then went out under a
   * fresh id, which is by definition not a replay, so the store stored them a second time: the very
   * duplicate the id exists to prevent, through the one door the id cannot see.
   */
  const pending: Pending[] = []

  function arm(): void {
    if (!closed && timer === null) timer = window.setTimeout(() => flush(), opts.flushMs)
  }

  function trim(): void {
    if (queue.length <= MAX_QUEUE_LINES) return
    let gone = queue.splice(0, queue.length - MAX_QUEUE_LINES).length
    dropped += gone
    // The waiting batches lead the queue, oldest first, so the eviction eats them in that order: shrink
    // each window with it and let a batch go once none of its lines are left to resend.
    while (gone > 0 && pending.length > 0) {
      const head = pending[0]
      const take = Math.min(gone, head.lines)
      head.lines -= take
      gone -= take
      if (head.lines === 0) pending.shift()
    }
  }

  function requeue(batch: string[], id: string, error: string): void {
    queue.unshift(...batch)
    requeued += batch.length
    // Back to the front of both at once: the batch's lines lead the queue again, so its entry leads the
    // waiting list, and the windows stay lined up with the queue however many batches are in the air.
    pending.unshift({ id, lines: batch.length, error })
    trim()
    console.error(`[remote] log batch failed, requeued: ${error}`)
    arm()
  }

  /** Clears what the counters report, but only once no batch is still waiting to be reported on. */
  function settleCounters(): void {
    if (pending.length > 0) return
    requeued = 0
    dropped = 0
  }

  /**
   * A 4xx is a verdict on the batch itself — malformed, too big, or a key the store no longer knows —
   * and no resend can change the answer. Retrying one forever posts the same body every `flushMs` for
   * the life of the tab while new lines push the session being played out of the queue, so let the
   * batch go and leave a line behind: the analysis reads a hole it can see, not one it has to infer.
   */
  function drop(batch: string[], reason: string): void {
    queue.push(
      JSON.stringify({
        event: 'flush:drop',
        at: new Date().toISOString(),
        perf: Math.round(performance.now()),
        lines: batch.length,
        dropped,
        error: reason,
      }),
    )
    settleCounters()
    trim()
    console.error(`[remote] log batch dropped, it cannot succeed on a resend: ${reason}`)
    arm()
  }

  function settle(settled: string): void {
    // A response can still be in flight when close() runs (close()'s own final drain resolves after
    // `closed = true`, and an earlier timer-path fetch may already be on the wire): without this guard
    // its `name` reaches `onName` after the caller believes the channel is dead. For a tester that
    // callback writes the key back into storage, so Stop would silently undo itself on the next reload.
    if (closed || settled === name) return
    name = settled
    opts.onName?.(settled)
  }

  function post(
    batch: string[],
    id: string,
    resent: Pending | null,
    keepalive: boolean,
    endpoint: string,
  ): Promise<void> {
    // The gap the retry left in the file is itself a line, so the analysis can see it instead of
    // reading a session that starts in the middle of nowhere. It reports the failure of the batch being
    // resent, read off that batch's own record rather than off whatever failed most recently.
    const body =
      resent === null
        ? batch
        : [
            JSON.stringify({
              event: 'flush:retry',
              at: new Date().toISOString(),
              perf: Math.round(performance.now()),
              lines: requeued,
              dropped,
              error: resent.error,
            }),
            ...batch,
          ]
    return fetch(endpoint, { method: 'POST', headers: { 'x-batch-id': id }, body: body.join('\n'), keepalive })
      .then(async (res) => {
        if (res.status >= 400 && res.status < 500) {
          drop(batch, `${res.status} ${res.statusText}`)
          return
        }
        // What is left — a network error or a 5xx — is the server or the radio, not the batch: those
        // are the failures a resend can still fix, including the 503 `api/server.ts` answers while its
        // schema check is still failing.
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        // Nothing here belongs to this batch alone any more: its entry left `pending` when it was sent,
        // so a landing batch has nothing of anyone else's to clear.
        settleCounters()
        // The answer names the device: a tester only has a key, and this is where its name comes from.
        const data = (await res.json().catch(() => ({}))) as { name?: unknown }
        if (typeof data.name === 'string') settle(data.name)
      })
      .catch((err: unknown) => {
        requeue(batch, id, (err as Error).message)
      })
  }

  /**
   * `keepalive` is not free: Chrome caps the sum of the bodies of all in-flight keepalive requests at
   * 64 KiB per document, and the session-start burst is ~63 KB (`session:start` 21.6 KB + `session:truth`
   * 10 KB, twice under React StrictMode, plus `cmd:done` and `screen`). With any earlier batch still on
   * the wire the fetch rejects outright and the whole batch is gone — which is how `.remote/synth.ndjson`
   * ended up with a `session:done` and no `session:start`. So the timer path sends a plain fetch and keeps
   * a single batch in flight; only the hide/close path, which cannot wait for anything, asks for keepalive.
   *
   * A batch that failed goes back out alone, under its own id, even on the keepalive path: whatever was
   * logged after it waits for the next flush rather than riding along under an id the store may already
   * hold. On close that means a pending retry is all that leaves — the connection was already broken,
   * and one keepalive body is all Chrome's 64 KiB budget reliably allows anyway.
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
    // The oldest waiting batch goes first, and its entry leaves with it: while it is on the wire it no
    // longer leads the queue, so `trim()` must not count evictions against its window, and nothing that
    // lands in the meantime can clear it.
    const resent = pending.shift() ?? null
    const done = post(
      queue.splice(0, resent?.lines ?? queue.length),
      resent?.id ?? `${pageId}-${++batches}`,
      resent,
      keepalive,
      endpoint,
    )
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
