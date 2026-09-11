// A scenario is a script of remote commands with waits and on-device instructions, run against one device.
// It exists so a measurement can be repeated on the iPhone, the iPad and the Mac with the same steps and
// leave a report next to the logs.
import { appendFile, mkdir } from 'node:fs/promises'
import { createClient, DEFAULT_URL, defaultUntil, type RemoteClient } from './client'

export interface Report {
  line(s: string): void
  json(title: string, data: unknown): void
}

export interface DeviceApi {
  name: string
  cmd(
    cmd: string,
    args?: Record<string, unknown>,
    opts?: { until?: string; timeoutMs?: number },
  ): Promise<Record<string, unknown>>
  waitFor(event: string, timeoutMs?: number): Promise<Record<string, unknown>>
  say(text: string, seconds: number): Promise<void>
  sleep(ms: number): Promise<void>
}

export interface Scenario {
  name: string
  run(d: DeviceApi, report: Report): Promise<void>
}

export const defineScenario = (name: string, run: Scenario['run']): Scenario => ({ name, run })

export async function runScenario(scenario: Scenario, to: string | null): Promise<string> {
  const client: RemoteClient = createClient(process.env.RUDIMETER_REMOTE_URL ?? DEFAULT_URL)
  const devices = await client.devices()
  const device = to ? devices.find((d) => d.name === to) : devices.length === 1 ? devices[0] : undefined
  if (!device) throw new Error(`pass --to: ${devices.map((d) => d.name).join(', ') || 'no device connected'}`)
  await mkdir('.remote', { recursive: true })
  const file = `.remote/scenario-${scenario.name}-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.md`
  const write = (s: string) => appendFile(file, `${s}\n`)
  await write(`# ${scenario.name} · ${device.name} · ${new Date().toISOString()}\n`)
  const report: Report = {
    line: (s) => {
      console.log(s)
      void write(s)
    },
    json: (title, data) => {
      console.log(title)
      void write(`\n**${title}**\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`)
    },
  }
  let seq = device.seq
  const api: DeviceApi = {
    name: device.name,
    async cmd(cmd, args = {}, opts = {}) {
      const sent = await client.send(cmd, args, { to: device.name })
      const line = await client.waitFor(
        device.name,
        opts.until ?? defaultUntil(cmd),
        sent.seq[device.name],
        opts.timeoutMs ?? 60000,
      )
      seq = Number(line.seq)
      report.line(`- ${cmd} ${JSON.stringify(args)} → ${String(line.event)}`)
      return line
    },
    async waitFor(event, timeoutMs = 60000) {
      const line = await client.waitFor(device.name, event, seq, timeoutMs)
      seq = Number(line.seq)
      return line
    },
    async say(text, seconds) {
      await client.send('say', { text, seconds }, { to: device.name })
      report.line(`- say "${text}"`)
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
  await scenario.run(api, report)
  report.line(`\nDone: ${file}`)
  return file
}
