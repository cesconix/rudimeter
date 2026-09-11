// Dev-only remote debug channel. Pages register over SSE and receive commands; logs come in as NDJSON
// and land in `.remote/<device>.ndjson`; raw microphone audio lands next to them as WAV. It exists so
// that an iPhone on the desk can be driven from the terminal and its numbers read from a file, instead
// of screenshots of a log.
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { resolveTarget, safeName, uniqueName } from './registry'
import { encodeWav } from './wav'

const DIR = '.remote'
const KEEP = 500
const WAIT_CAP_MS = 20000
const BROADCAST_OK = new Set(['ping', 'say', 'record'])

interface Client {
  name: string
  ua: string
  connectedAt: string
  res: ServerResponse
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

      server.middlewares.use('/__remote', async (req, res) => {
        await ready
        // Connect strips the mount path: `req.url` starts at `/events`, `/log`, …
        const url = new URL(req.url ?? '/', 'http://localhost')
        const q = url.searchParams
        const device = safeName(q.get('device') ?? 'device')
        try {
          if (req.method === 'GET' && url.pathname === '/events') {
            const name = uniqueName(device, clients.keys())
            // No `connection` header: Vite may serve this over HTTP/2, where it is illegal.
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
            res.write(`event: hello\ndata: ${JSON.stringify({ name })}\n\n`)
            clients.set(name, { name, ua: q.get('ua') ?? '', connectedAt: new Date().toISOString(), res })
            info(`${name} connected`)
            // A comment every 15 s keeps iOS from dropping an idle stream.
            const ping = setInterval(() => res.write(': ping\n\n'), 15000)
            req.on('close', () => {
              clearInterval(ping)
              clients.delete(name)
              info(`${name} disconnected`)
            })
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
            const text = (await readBody(req)).toString('utf8')
            const out: string[] = []
            for (const raw of text.split('\n')) {
              if (!raw.trim()) continue
              const parsed = JSON.parse(raw) as Record<string, unknown>
              const event = typeof parsed.event === 'string' ? parsed.event : 'unknown'
              out.push(remember(device, event, parsed).raw)
              if (event !== 'hit' && event !== 'output') info(`${device} ${event}`)
            }
            await appendFile(join(root, `${device}.ndjson`), `${out.join('\n')}\n`)
            json(res, 200, { ok: true, seq: seqs.get(device) ?? 0 })
            return
          }
          if (req.method === 'POST' && url.pathname === '/audio') {
            const buf = await readBody(req)
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
          json(res, 404, { error: `unknown route ${req.method} ${url.pathname}` })
        } catch (err) {
          json(res, 500, { error: (err as Error).message })
        }
      })
    },
  }
}
