// bun run remote ls
// bun run remote [--to iphone | --all] <cmd> [<json args>] [--until event] [--timeout ms]
// bun run remote tail [name] [--n 50]
// bun run remote wait <event> [--to name] [--timeout ms]
// bun run remote report [name] [--n 50]
// bun run remote verdict [name]
// bun run remote calibrations [name]
// bun run remote feedback [name] [--n N] [--export path]
// The dev server must be running (`bun run dev`); `RUDIMETER_REMOTE_URL` overrides https://localhost:5173.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { EXERCISES } from '../../src/data/exercises'
import { createClient, DEFAULT_URL, defaultUntil, parseArgs } from './client'
import { deviceReport } from './device-report'
import { collectFeedback } from './feedback'
import { formatCalibrations, formatFeedback, formatFeedbackMarkdown, formatTable, formatVerdict } from './report-text'

const args = parseArgs(process.argv.slice(2))
const client = createClient(process.env.RUDIMETER_REMOTE_URL ?? DEFAULT_URL)
const deps = { exerciseById: (id: string) => EXERCISES.find((e) => e.id === id) }

if (args.cmd === 'ls') {
  const devices = await client.devices()
  if (devices.length === 0) console.log('no device connected')
  for (const d of devices) console.log(`${d.name}\t${d.ua}\tsince ${d.connectedAt}\tseq ${d.seq}`)
} else if (args.cmd === 'tail') {
  const name = String(args.args.name ?? (await oneDevice()))
  const text = await readFile(`.remote/${name}.ndjson`, 'utf8')
  const lines = text.trimEnd().split('\n')
  console.log(lines.slice(-(args.n ?? 50)).join('\n'))
} else if (args.cmd === 'wait') {
  const name = args.to ?? (await oneDevice())
  const devices = await client.devices()
  const seq = devices.find((d) => d.name === name)?.seq ?? 0
  console.log(JSON.stringify(await client.waitFor(name, String(args.args.event), seq, args.timeoutMs), null, 2))
} else if (args.cmd === 'report' || args.cmd === 'verdict' || args.cmd === 'calibrations') {
  // Reads the file, not the server: works with the dev server down, on yesterday's logs.
  const name = String(args.args.name ?? (await oneDevice()))
  const text = await readFile(`.remote/${name}.ndjson`, 'utf8')
  const report = deviceReport(name, text, deps, args.n ?? 50)
  if (args.cmd === 'report') console.log(formatTable([...report.sessions].reverse()))
  else if (args.cmd === 'verdict') {
    const a = report.sessions[0]
    if (!a) throw new Error(`no session in .remote/${name}.ndjson`)
    console.log(formatVerdict(a))
  } else console.log(formatCalibrations(report.calibrations, report.budget))
} else if (args.cmd === 'feedback') {
  // Every comment on disk with the session it belongs to, newest first: one device when named, else all.
  // Reads the files, like report: a review happens with the server down, on any day's logs.
  const names = args.args.name
    ? [String(args.args.name)]
    : // A checkout with no session yet has no `.remote/` at all: fall back to empty, like `/sessions` does,
      // so the command prints "no feedback yet" instead of a raw ENOENT.
      (await readdir('.remote').catch(() => [] as string[]))
        .filter((f) => f.endsWith('.ndjson'))
        .map((f) => f.slice(0, -'.ndjson'.length))
        .sort()
  const files: { device: string; text: string }[] = []
  for (const device of names) files.push({ device, text: await readFile(`.remote/${device}.ndjson`, 'utf8') })
  const all = collectFeedback(files, deps)
  const entries = args.n === null ? all : all.slice(0, args.n)
  console.log(formatFeedback(entries))
  if (args.export !== null) {
    // The export is the archive that outlives a hand-emptied `.remote/`: writing it in there defeats it.
    if (resolve(args.export).startsWith(`${resolve('.remote')}${sep}`))
      throw new Error(`--export must point outside .remote/: ${args.export}`)
    await writeFile(args.export, formatFeedbackMarkdown(entries, new Date().toISOString()))
    console.log(`exported ${entries.length} comments to ${args.export}`)
  }
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
