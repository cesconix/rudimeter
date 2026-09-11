// bun run remote ls
// bun run remote [--to iphone | --all] <cmd> [<json args>] [--until event] [--timeout ms]
// bun run remote tail [name] [--n 50]
// bun run remote wait <event> [--to name] [--timeout ms]
// The dev server must be running (`bun run dev`); `RUDIMETER_REMOTE_URL` overrides https://localhost:5173.
import { readFile } from 'node:fs/promises'
import { createClient, DEFAULT_URL, defaultUntil, parseArgs } from './client'

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
} else {
  const sent = await client.send(args.cmd, args.args, args.all ? { all: true } : args.to ? { to: args.to } : {})
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
