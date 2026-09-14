// The schema check, lazy and retriable, plus the answer to give while it is failing.
//
// `api/server.ts` used to run `store.ensureSchema()` at module load with no `.catch` and `await` it
// outside the request handler, so a rejection escaped the handler entirely — the caller got the
// runtime's own plain-text 500, never the shaped one, and on a warm instance the rejected promise
// stayed rejected and failed every request that instance went on to serve. Observed twice on live
// previews: Neon suspends an idle compute and a cold connect takes hundreds of milliseconds to
// seconds, so a cold start that loses the race burns the request.
const json = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

/**
 * Runs `ensureSchema` on the first call and memoises it — but only while it succeeds: a failure is
 * forgotten, so the next request tries again rather than inheriting it.
 */
export function lazySchema(ensureSchema: () => Promise<void>): () => Promise<void> {
  let ready: Promise<void> | null = null
  return () => {
    if (ready === null)
      ready = ensureSchema().catch((err: unknown) => {
        ready = null
        throw err
      })
    return ready
  }
}

/**
 * 503, not 500: it tells the caller to retry, and being a 5xx it is the one shape a page's flush keeps
 * — `post()` in src/telemetry/client.ts drops a 4xx batch for good and only requeues a 5xx or a
 * dropped connection. The message says nothing about the store beyond its being unreachable.
 */
export const storeUnavailable = (): Response => json(503, { error: 'store unavailable' })
