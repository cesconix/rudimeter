// bun run remote ls
// bun run remote [--to iphone | --all] <cmd> [<json args>] [--until event] [--timeout ms]
// bun run remote tail [name] [--n 50]
// bun run remote wait <event> [--to name] [--timeout ms]
// bun run remote report [name] [--n 50]
// bun run remote verdict [name]
// bun run remote calibrations [name]
// The dev server must be running (`bun run dev`); `RUDIMETER_REMOTE_URL` overrides https://localhost:5173.
import { readFile } from 'node:fs/promises'
import { EXERCISES } from '../../src/data/exercises'
import { createClient, DEFAULT_URL, defaultUntil, parseArgs } from './client'
import { deviceReport } from './device-report'
import { formatCalibrations, formatTable, formatVerdict } from './report-text'

const args = parseArgs(process.argv.slice(2))
const client = createClient(process.env.RUDIMETER_REMOTE_URL ?? DEFAULT_URL)

if (args.cmd === 'ls') {
  const devices = await client.devices()
  if (devices.length === 0) console.log('no device connected')
  for (const d of devices) console.log(`${d.name}\t${d.ua}\tsince ${d.connectedAt}\tseq ${d.seq}`)
} else if (args.cmd === 'tail') {
  const name = String(args.args.name ?? (await oneDevice()))
  const text = await readFile(`.remote/${name}.ndjson`, 'utf8')
  const lines = text.trimEnd().split('\n')
  console.log(lines.slice(-args.n).join('\n'))
} else if (args.cmd === 'wait') {
  const name = args.to ?? (await oneDevice())
  const devices = await client.devices()
  const seq = devices.find((d) => d.name === name)?.seq ?? 0
  console.log(JSON.stringify(await client.waitFor(name, String(args.args.event), seq, args.timeoutMs), null, 2))
} else if (args.cmd === 'report' || args.cmd === 'verdict' || args.cmd === 'calibrations') {
  // Reads the file, not the server: works with the dev server down, on yesterday's logs.
  const name = String(args.args.name ?? (await oneDevice()))
  const text = await readFile(`.remote/${name}.ndjson`, 'utf8')
  const report = deviceReport(name, text, { exerciseById: (id) => EXERCISES.find((e) => e.id === id) }, args.n)
  if (args.cmd === 'report') console.log(formatTable([...report.sessions].reverse()))
  else if (args.cmd === 'verdict') {
    const a = report.sessions[0]
    if (!a) throw new Error(`no session in .remote/${name}.ndjson`)
    console.log(formatVerdict(a))
  } else console.log(formatCalibrations(report.calibrations, report.budget))
} else {
  const sent = await client.send(args.cmd, args.args, args.all ? { all: true } : args.to ? { to: args.to } : {})
  // `--all` broadcasts to whoever is connected, so the server answers 200 with an empty `delivered` when
  // nobody is: the loop below would then print nothing and exit 0, which reads as "sent". Without
  // `--all`, `resolveTarget` has already turned the same situation into a 409.
  if (sent.delivered.length === 0) throw new Error(`nothing to send "${args.cmd}" to: no device connected`)
  const until = args.until ?? defaultUntil(args.cmd)
  for (const device of sent.delivered) {
    const line = await client.waitFor(device, until, sent.seq[device], args.timeoutMs)
    console.log(JSON.stringify(line, null, 2))
  }
}

async function oneDevice(): Promise<string> {
  const devices = await client.devices()
  if (devices.length !== 1)
    throw new Error(`pass --to: ${devices.map((d) => d.name).join(', ') || 'no device connected'}`)
  return devices[0].name
}
