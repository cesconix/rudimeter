// Talks to the dev server's `/__remote` from Bun: the CLI and the scenarios both go through here.

export interface Device {
  name: string
  ua: string
  connectedAt: string
  seq: number
}

export interface Sent {
  id: number
  delivered: string[]
  seq: Record<string, number>
}

export interface RemoteClient {
  devices(): Promise<Device[]>
  send(cmd: string, args: Record<string, unknown>, target: { to?: string; all?: boolean }): Promise<Sent>
  /** Resolves with the first line of `device` after `after` whose event is `event` (or `cmd:error`). */
  waitFor(device: string, event: string, after: number, timeoutMs: number): Promise<Record<string, unknown>>
}

export const DEFAULT_URL = 'https://localhost:5173'

// `fetchImpl` defaults to the global `fetch` so `cli.ts` and the Task 6 scenarios keep calling
// `createClient(baseUrl)`; tests inject a fake to script responses without a real dev server.
export function createClient(baseUrl: string, fetchImpl: typeof fetch = fetch): RemoteClient {
  const base = `${baseUrl}/__remote`
  async function check(res: Response): Promise<unknown> {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`)
    return data
  }
  return {
    devices: async () => (await check(await fetchImpl(`${base}/devices`))) as Device[],
    send: async (cmd, args, target) =>
      (await check(
        await fetchImpl(`${base}/cmd`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cmd, args, ...target }),
        }),
      )) as Sent,
    async waitFor(device, event, after, timeoutMs) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        // Each poll is capped at 20 s server-side, so a 60 s CLI timeout takes several round-trips.
        const slice = Math.min(20000, deadline - Date.now())
        const url = `${base}/wait?device=${encodeURIComponent(device)}&event=${encodeURIComponent(event)}&after=${after}&timeoutMs=${slice}`
        const res = await fetchImpl(url)
        if (res.status === 204) continue
        const line = (await check(res)) as Record<string, unknown>
        if (line.event === 'cmd:error') throw new Error(`${device}: ${String(line.error)}`)
        return line
      }
      throw new Error(`timeout after ${timeoutMs} ms waiting for "${event}" from ${device}`)
    },
  }
}

// A comma list ends the wait on either event: a failed calibration must return, not time out.
const UNTIL: Record<string, string> = {
  calibrate: 'calibration:done,calibration:failed',
  start: 'session:start',
  stop: 'session:done',
  record: 'audio',
}

export const defaultUntil = (cmd: string): string => UNTIL[cmd] ?? 'cmd:done'

export interface ParsedArgs {
  to: string | null
  all: boolean
  cmd: string
  args: Record<string, unknown>
  until: string | null
  timeoutMs: number
  /** null: the command's own default (50 lines for tail/report, everything for feedback) */
  n: number | null
  export: string | null
}

const FLAGS = ['to', 'all', 'until', 'timeout', 'n', 'export']

/**
 * `[--to name | --all] <cmd> [<json>] [--until event] [--timeout ms]`; `ls`, `tail [name] [--n N]`,
 * `wait <event>`, `report [name] [--n N]`, `verdict [name]`, `calibrations [name]`,
 * `feedback [name] [--n N] [--export path]`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    to: null,
    all: false,
    cmd: '',
    args: {},
    until: null,
    timeoutMs: 60000,
    n: null,
    export: null,
  }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const flag = a.slice(2)
    if (!FLAGS.includes(flag)) throw new Error(`unknown flag "${a}"; flags: ${FLAGS.map((f) => `--${f}`).join(', ')}`)
    if (flag === 'all') {
      out.all = true
      continue
    }
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${flag} needs a value`)
    if (flag === 'to') out.to = value
    else if (flag === 'until') out.until = value
    else if (flag === 'timeout') out.timeoutMs = Number(value)
    else if (flag === 'export') out.export = value
    else out.n = Number(value)
  }
  const [cmd, raw] = positional
  if (!cmd) throw new Error('usage: remote [--to name | --all] <cmd> [<json>] | ls | tail [name] | wait <event>')
  out.cmd = cmd
  if (cmd === 'tail' || cmd === 'report' || cmd === 'verdict' || cmd === 'calibrations' || cmd === 'feedback')
    out.args = raw ? { name: raw } : {}
  else if (cmd === 'wait') {
    if (!raw) throw new Error('wait needs an event name')
    out.args = { event: raw }
  } else if (raw !== undefined) {
    try {
      out.args = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new Error(`args must be JSON, got ${raw}`)
    }
  }
  return out
}
