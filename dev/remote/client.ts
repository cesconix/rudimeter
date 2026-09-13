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
  /** reads rudimeter.com over HTTP with DASHBOARD_TOKEN, instead of opening .remote/dev.db directly */
  remote: boolean
  /** device name `import` writes under */
  as: string | null
  /** `import`: rewrite seq from the local device's lastSeq instead of trusting the file's own numbering */
  renumber: boolean
  /** `export`: overwrite an existing file at the destination path */
  force: boolean
}

const FLAGS = ['to', 'all', 'until', 'timeout', 'n', 'export', 'remote', 'as', 'renumber', 'force']

/**
 * `[--to name | --all] <cmd> [<json>] [--until event] [--timeout ms]`; `ls`, `tail [name] [--n N] [--remote]`,
 * `wait <event>`, `report [name] [--n N] [--remote]`, `verdict [name] [--remote]`, `calibrations [name] [--remote]`,
 * `feedback [name] [--n N] [--export path] [--remote]`, `devices ls | devices add <name> [--remote]`,
 * `export <name> [path] [--force]`, `import <file> --as <name> [--renumber]`, `sync`.
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
    remote: false,
    as: null,
    renumber: false,
    force: false,
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
    if (flag === 'remote') {
      out.remote = true
      continue
    }
    if (flag === 'renumber') {
      out.renumber = true
      continue
    }
    if (flag === 'force') {
      out.force = true
      continue
    }
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${flag} needs a value`)
    if (flag === 'to') out.to = value
    else if (flag === 'until') out.until = value
    else if (flag === 'timeout') out.timeoutMs = Number(value)
    else if (flag === 'export') out.export = value
    else if (flag === 'as') out.as = value
    else out.n = Number(value)
  }
  const [cmd, a, b] = positional
  if (!cmd) throw new Error('usage: remote [--to name | --all] <cmd> [<json>] | ls | tail [name] | wait <event>')
  out.cmd = cmd
  if (cmd === 'tail' || cmd === 'report' || cmd === 'verdict' || cmd === 'calibrations' || cmd === 'feedback')
    out.args = a ? { name: a } : {}
  else if (cmd === 'devices') {
    if (a !== 'ls' && a !== 'add') throw new Error('usage: remote devices ls | remote devices add <name>')
    if (a === 'add' && !b) throw new Error('devices add needs a name')
    out.args = { sub: a, name: b ?? null }
  } else if (cmd === 'export') {
    if (!a) throw new Error('export needs a device name')
    out.args = { name: a, path: b ?? null }
  } else if (cmd === 'import') {
    if (!a) throw new Error('import needs a file')
    if (out.as === null) throw new Error('import needs --as <name>')
    out.args = { file: a }
  } else if (cmd === 'sync') out.args = {}
  else if (cmd === 'wait') {
    if (!a) throw new Error('wait needs an event name')
    out.args = { event: a }
  } else if (a !== undefined) {
    try {
      out.args = JSON.parse(a) as Record<string, unknown>
    } catch {
      throw new Error(`args must be JSON, got ${a}`)
    }
  }
  return out
}
