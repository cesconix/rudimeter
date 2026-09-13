// connect ↔ fetch: `api/_lib/handler.ts` is written against `Request`/`Response`, as in production; the Vite
// dev server speaks Node's `IncomingMessage`/`ServerResponse`. These two are the pure half of the bridge.
import type { IncomingHttpHeaders } from 'node:http'
import type { Appended } from '../../api/_lib/store'

/**
 * `host`, `connection` and `content-length` are left out: `Request` computes its own, and a copied
 * `content-length` on a body that is already a buffer is a header the runtime may refuse to set.
 */
const SKIP = new Set(['host', 'connection', 'content-length'])

export function requestFrom(
  req: { method?: string; url?: string; headers: IncomingHttpHeaders },
  body: Uint8Array<ArrayBuffer> | undefined,
): Request {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    // Node's HTTP/2 compat layer puts `:method`, `:path`, `:scheme`, `:authority` into `req.headers`
    // (the Vite dev server speaks HTTP/2 over its basic-ssl TLS); `Headers` throws on any name starting
    // with `:`, which took down every `/api/*` route on the real protocol the browser uses. The URL
    // below is already synthetic (`http://localhost…`), so none of these carry information this needs.
    if (k.startsWith(':') || SKIP.has(k.toLowerCase())) continue
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  const method = req.method ?? 'GET'
  return new Request(`http://localhost${req.url ?? '/'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  })
}

export interface Line {
  seq: number
  event: string
  raw: string
}

/** The lines of one append as `/wait` matches them: `seq` from the range, `event` read back from the JSON. */
export function linesFrom(out: Appended): Line[] {
  return out.raws.map((raw, i) => ({
    seq: out.first + i,
    event: String((JSON.parse(raw) as { event?: unknown }).event ?? 'unknown'),
    raw,
  }))
}
