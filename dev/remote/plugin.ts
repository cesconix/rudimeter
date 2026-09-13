// Dev-only remote debug channel. Pages register over SSE and receive commands; logs come in as NDJSON
// and land in `.remote/<device>.ndjson`; raw microphone audio lands next to them as WAV. It exists so
// that an iPhone on the desk can be driven from the terminal and its numbers read from a file, instead
// of screenshots of a log.
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { safeName } from '../../api/names'
import { EXERCISES } from '../../src/data/exercises'
import { deviceReport } from './device-report'
import { parseFeedbackBody } from './feedback'
import { lastSeqOf, resolveTarget, uniqueName } from './registry'
import { encodeWav } from './wav'

const DIR = '.remote'
/**
 * The ring only has to cover the gap between one `/wait` poll answering 204 and the next poll arriving —
 * sub-millisecond, since a waiter is registered while the poll is open. 500 lines is ~45 s at the
 * busiest rate seen (~10 `hit`/s plus 1 `output`/s), orders of magnitude more than that gap needs.
 */
const KEEP = 500
/**
 * How long one `/wait` poll may hang. 20 s sits under the 30 s where iOS Safari and most proxies drop an
 * idle request; a longer CLI timeout is honoured by chaining polls (see `waitFor` in client.ts).
 */
const WAIT_CAP_MS = 20000
/** The three commands that do not change app state, so firing them at every device at once is safe. */
const BROADCAST_OK = new Set(['ping', 'say', 'record'])
/**
 * 12 MB is 60 s of mono float32 at 48 kHz (11.0 MiB), the longest recording either page asks for. Past
 * that, or on a body that is not a whole number of float32 samples, the POST is a bug or a stray client,
 * not a recording: refuse it instead of writing a junk WAV and buffering the whole thing in memory first.
 */
const MAX_AUDIO_BYTES = 12 * 1024 * 1024

interface Client {
  name: string
  ua: string
  connectedAt: string
  res: ServerResponse
  /** The 15 s keep-alive, kept here so whoever drops the client can stop it too. */
  keepAlive: ReturnType<typeof setInterval>
}

interface Line {
  seq: number
  event: string
  raw: string
}

interface Waiter {
  device: string
  event: string
  after: number
  resolve(line: Line | null): void
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(data))
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')

export function remotePlugin(): Plugin {
  const clients = new Map<string, Client>()
  const lines = new Map<string, Line[]>()
  const seqs = new Map<string, number>()
  // One in-flight `.ndjson` read per device, shared by `ensureSeq` below: see the comment there.
  const seqReads = new Map<string, Promise<void>>()
  const waiters: Waiter[] = []
  let nextId = 1

  // `event` may be a comma list (`calibration:done,calibration:failed`): a wait ends on any of them, or on a command error.
  const matches = (w: Waiter, l: Line) =>
    l.seq > w.after && (w.event.split(',').includes(l.event) || l.event === 'cmd:error')

  /** Numbers the line, stores it for `/wait`, wakes the waiters. Returns the line with `seq` and `receivedAt` inside. */
  function remember(device: string, event: string, fields: Record<string, unknown>): Line {
    const seq = (seqs.get(device) ?? 0) + 1
    seqs.set(device, seq)
    const line = { seq, event, raw: JSON.stringify({ ...fields, seq, receivedAt: new Date().toISOString() }) }
    const list = lines.get(device) ?? []
    list.push(line)
    if (list.length > KEEP) list.splice(0, list.length - KEEP)
    lines.set(device, list)
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].device === device && matches(waiters[i], line)) waiters.splice(i, 1)[0].resolve(line)
    }
    return line
  }

  return {
    name: 'rudimeter-remote',
    apply: 'serve',
    configureServer(server) {
      const root = join(server.config.root, DIR)
      const ready = mkdir(root, { recursive: true })
      const info = (msg: string) => server.config.logger.info(`[remote] ${msg}`)

      /**
       * `seq` is per device and per file, not per server run: the numbering resumes from the last line
       * on disk, once per device after a start. A device that never logged has no file: 0. Reads from
       * `root` — the same directory `appendFile`/`writeFile` below use, not a bare `.remote/`, which
       * would silently read nothing (and reset to 0) if the dev server's cwd ever differed from
       * `server.config.root`.
       */
      const ensureSeq = async (device: string): Promise<void> => {
        if (seqs.has(device)) return
        // Two first-touch requests for one device (a `/log` batch racing an `/audio` upload right after
        // a restart) share this one read instead of racing separate reads that could each resolve after
        // `remember()` already advanced `seqs` and clobber it back down.
        let pending = seqReads.get(device)
        if (!pending) {
          pending = readFile(join(root, `${device}.ndjson`), 'utf8')
            .catch(() => '')
            .then((text) => {
              seqs.set(device, lastSeqOf(text))
            })
          seqReads.set(device, pending)
          void pending.finally(() => seqReads.delete(device))
        }
        await pending
      }

      /**
       * A reload on the phone must come back as `iphone`, not `iphone-2`: `uniqueName` dedupes against
       * this map, and a stream whose 'close' never arrived would keep the name occupied for the rest of
       * the dev session (seen over HTTP/2, where a navigated-away page can die silently). Sweep the
       * corpses before handing out a name.
       */
      const reapDeadClients = (): void => {
        for (const [name, c] of clients) {
          if (!c.res.destroyed && !c.res.writableEnded) continue
          clearInterval(c.keepAlive)
          clients.delete(name)
          info(`${name} dropped: the stream was already gone`)
        }
      }

      server.middlewares.use('/__remote', async (req, res) => {
        await ready
        // Every request, not only `/events`: a page that is closed rather than reloaded leaves a corpse
        // that `/devices` lists and `/cmd` "delivers" to, so `remote ls` lies and one live phone reads as
        // two and demands `--to`. The sweep is a walk over a handful of clients, cheap at any rate.
        reapDeadClients()
        // Connect strips the mount path: `req.url` starts at `/events`, `/log`, …
        const url = new URL(req.url ?? '/', 'http://localhost')
        const q = url.searchParams
        const device = safeName(q.get('device') ?? 'device')
        try {
          if (req.method === 'GET' && url.pathname === '/events') {
            reapDeadClients()
            const name = uniqueName(device, clients.keys())
            // No `connection` header: Vite may serve this over HTTP/2, where it is illegal.
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
            res.write(`event: hello\ndata: ${JSON.stringify({ name })}\n\n`)
            // A comment every 15 s keeps iOS from dropping an idle stream.
            const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000)
            clients.set(name, { name, ua: q.get('ua') ?? '', connectedAt: new Date().toISOString(), res, keepAlive })
            info(`${name} connected`)
            const gone = () => {
              clearInterval(keepAlive)
              // Only if this stream still holds the name: a reap may already have given it to a newer
              // page, and a late 'close' from the corpse must not disconnect the live one.
              if (clients.get(name)?.res !== res) return
              clients.delete(name)
              info(`${name} disconnected`)
            }
            req.on('close', gone)
            // 'close' does not always arrive. When it does not, the failing keep-alive write is the only
            // sign the stream is dead: same cleanup, so the name is freed either way.
            res.on('error', gone)
            return
          }
          if (req.method === 'GET' && url.pathname === '/devices') {
            json(
              res,
              200,
              [...clients.values()].map(({ name, ua, connectedAt }) => ({
                name,
                ua,
                connectedAt,
                seq: seqs.get(name) ?? 0,
              })),
            )
            return
          }
          if (req.method === 'POST' && url.pathname === '/log') {
            await ensureSeq(device)
            const rawLines = (await readBody(req))
              .toString('utf8')
              .split('\n')
              .filter((raw) => raw.trim())
            // Parse the whole batch before remembering any line: `remember()` advances `seq` and can
            // wake a `/wait` waiter, but the batch is only written to disk once, at the end. A line
            // that fails to parse must abort before any earlier line in the same batch gets a `seq`
            // or a waiter that the on-disk file will never actually contain.
            const parsed: { event: string; fields: Record<string, unknown> }[] = []
            for (const [i, raw] of rawLines.entries()) {
              let fields: Record<string, unknown>
              try {
                fields = JSON.parse(raw) as Record<string, unknown>
              } catch (err) {
                json(res, 400, { error: `malformed JSON on line ${i + 1}: ${(err as Error).message}` })
                return
              }
              const event = typeof fields.event === 'string' ? fields.event : 'unknown'
              parsed.push({ event, fields })
            }
            const out = parsed.map(({ event, fields }) => {
              const line = remember(device, event, fields)
              if (event !== 'hit' && event !== 'output') info(`${device} ${event}`)
              return line.raw
            })
            await appendFile(join(root, `${device}.ndjson`), `${out.join('\n')}\n`)
            json(res, 200, { ok: true, seq: seqs.get(device) ?? 0 })
            return
          }
          if (req.method === 'POST' && url.pathname === '/audio') {
            await ensureSeq(device)
            const buf = await readBody(req)
            if (buf.byteLength > MAX_AUDIO_BYTES || buf.byteLength % 4 !== 0) {
              json(res, 400, {
                error: `audio body rejected: ${buf.byteLength} bytes (max ${MAX_AUDIO_BYTES}, must be a multiple of 4)`,
              })
              return
            }
            // Buffer.concat does not promise 4-byte alignment: copy into a fresh Float32Array.
            const samples = new Float32Array(buf.byteLength / 4)
            new Uint8Array(samples.buffer).set(buf)
            const sampleRate = Number(q.get('sampleRate') ?? 48000)
            const file = `${device}-${stamp(new Date())}-${safeName(q.get('label') ?? 'audio')}.wav`
            await writeFile(join(root, file), encodeWav(samples, sampleRate))
            const seconds = samples.length / sampleRate
            const line = remember(device, 'audio', { event: 'audio', file, seconds, sampleRate })
            await appendFile(join(root, `${device}.ndjson`), `${line.raw}\n`)
            info(`${device} audio ${file} (${seconds.toFixed(1)} s)`)
            json(res, 200, { file, seconds })
            return
          }
          if (req.method === 'POST' && url.pathname === '/feedback') {
            // A comment typed on the dashboard for a session picked from its table, days after the fact if
            // need be. It lands in the device's own file as the same `session:feedback` line the app writes
            // from the summary, plus the session's id, since here nothing says which session "the last" is.
            let raw: unknown
            try {
              raw = JSON.parse((await readBody(req)).toString('utf8'))
            } catch (err) {
              json(res, 400, { error: `malformed JSON: ${(err as Error).message}` })
              return
            }
            const parsed = parseFeedbackBody(raw, device)
            if (!parsed.ok) {
              json(res, 400, { error: parsed.error })
              return
            }
            await ensureSeq(device)
            const line = remember(device, 'session:feedback', {
              event: 'session:feedback',
              at: new Date().toISOString(),
              sessionId: parsed.sessionId,
              text: parsed.text,
              source: 'dashboard',
            })
            await appendFile(join(root, `${device}.ndjson`), `${line.raw}\n`)
            info(`${device} session:feedback from the dashboard (${parsed.text.length} chars)`)
            json(res, 200, { ok: true, seq: line.seq })
            return
          }
          if (req.method === 'POST' && url.pathname === '/cmd') {
            const body = JSON.parse((await readBody(req)).toString('utf8')) as {
              to?: string
              all?: boolean
              cmd: string
              args?: Record<string, unknown>
            }
            let targets: string[]
            if (body.all) {
              if (!BROADCAST_OK.has(body.cmd)) {
                json(res, 400, {
                  error: `"${body.cmd}" cannot be broadcast; --all is for ${[...BROADCAST_OK].join(', ')}`,
                })
                return
              }
              targets = [...clients.keys()]
            } else {
              const r = resolveTarget(body.to ?? null, [...clients.keys()])
              if (!r.ok) {
                json(res, 409, { error: r.error })
                return
              }
              targets = [r.name]
            }
            const id = nextId++
            const seq = Object.fromEntries(targets.map((t) => [t, seqs.get(t) ?? 0]))
            for (const t of targets) {
              clients
                .get(t)
                ?.res.write(`event: cmd\ndata: ${JSON.stringify({ id, cmd: body.cmd, args: body.args ?? {} })}\n\n`)
            }
            info(`→ ${targets.join(', ')}: ${body.cmd} ${JSON.stringify(body.args ?? {})}`)
            json(res, 200, { id, delivered: targets, seq })
            return
          }
          if (req.method === 'GET' && url.pathname === '/wait') {
            const event = q.get('event') ?? 'cmd:done'
            const after = Number(q.get('after') ?? 0)
            const timeoutMs = Math.min(WAIT_CAP_MS, Number(q.get('timeoutMs') ?? WAIT_CAP_MS))
            const hit = (lines.get(device) ?? []).find((l) => matches({ device, event, after, resolve: () => {} }, l))
            const line =
              hit ??
              (await new Promise<Line | null>((resolve) => {
                const w: Waiter = { device, event, after, resolve }
                waiters.push(w)
                setTimeout(() => {
                  const i = waiters.indexOf(w)
                  if (i >= 0) waiters.splice(i, 1)[0].resolve(null)
                }, timeoutMs)
              }))
            if (line === null) {
              res.statusCode = 204
              res.end()
              return
            }
            res.setHeader('content-type', 'application/json')
            res.end(line.raw)
            return
          }
          if (req.method === 'GET' && url.pathname === '/sessions') {
            // Everything the dashboard shows, analysed here so the page stays a renderer. One device on
            // request, otherwise every log on disk. `last` caps the sessions per device (20 by default).
            const only = q.get('device')
            const last = Math.max(1, Number(q.get('last') ?? 20) || 20)
            const names = only
              ? [safeName(only)]
              : (await readdir(root).catch(() => [] as string[]))
                  .filter((f) => f.endsWith('.ndjson'))
                  .map((f) => f.slice(0, -'.ndjson'.length))
                  .sort()
            const deps = { exerciseById: (id: string) => EXERCISES.find((e) => e.id === id) }
            const devices = []
            for (const name of names) {
              const text = await readFile(join(root, `${name}.ndjson`), 'utf8').catch(() => '')
              devices.push(deviceReport(name, text, deps, last))
            }
            json(res, 200, { devices })
            return
          }
          json(res, 404, { error: `unknown route ${req.method} ${url.pathname}` })
        } catch (err) {
          json(res, 500, { error: (err as Error).message })
        }
      })
    },
  }
}
