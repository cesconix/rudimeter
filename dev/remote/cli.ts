// bun run remote ls
// bun run remote [--to iphone | --all] <cmd> [<json args>] [--until event] [--timeout ms]
// bun run remote tail [name] [--n 50] [--remote]
// bun run remote wait <event> [--to name] [--timeout ms]
// bun run remote report [name] [--n 50] [--remote]
// bun run remote verdict [name] [--remote]
// bun run remote calibrations [name] [--remote]
// bun run remote feedback [name] [--n N] [--export path] [--remote]
// bun run remote devices ls | devices add <name> [--remote]
// bun run remote export <name> [path] [--force]
// bun run remote import <file> --as <name> [--renumber]
// bun run remote sync
// Commands to a page need the dev server (`bun run dev`; `RUDIMETER_REMOTE_URL` overrides https://localhost:5173).
// Reads open `.remote/dev.db` directly; `--remote` reads rudimeter.com (`RUDIMETER_URL`) with `DASHBOARD_TOKEN`,
// both from `.env.local`, which Bun loads on its own.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { safeName } from '../../api/_lib/names'
import { SeqError } from '../../api/_lib/store'
import { deviceReport } from '../../src/analysis/device-report'
import { EXERCISES } from '../../src/data/exercises'
import { createClient, DEFAULT_URL, defaultUntil, parseArgs } from './client'
import { collectFeedback } from './feedback'
import { numbered, parseNdjson, renumbered, toNdjson, writeExported } from './ndjson'
import { formatCalibrations, formatFeedback, formatFeedbackMarkdown, formatTable, formatVerdict } from './report-text'
import { httpSource, localSource, openDevStore, type Source } from './source'
import { syncDevices } from './sync'

const args = parseArgs(process.argv.slice(2))
const client = createClient(process.env.RUDIMETER_REMOTE_URL ?? DEFAULT_URL)
const deps = { exerciseById: (id: string) => EXERCISES.find((e) => e.id === id) }
const REMOTE_URL = process.env.RUDIMETER_URL ?? 'https://rudimeter.com'

function remoteSource(): Source {
  const token = process.env.DASHBOARD_TOKEN
  if (!token) throw new Error('--remote needs DASHBOARD_TOKEN in .env.local')
  return httpSource(REMOTE_URL, token)
}
const source = async (): Promise<Source> => (args.remote ? remoteSource() : localSource(await openDevStore()))
const textOf = async (src: Source, name: string): Promise<string> =>
  toNdjson((await src.lines(name)).map((r) => r.line))

if (args.cmd === 'ls') {
  const devices = await client.devices()
  if (devices.length === 0) console.log('no device connected')
  for (const d of devices) console.log(`${d.name}\t${d.ua}\tsince ${d.connectedAt}\tseq ${d.seq}`)
} else if (args.cmd === 'tail') {
  const name = String(args.args.name ?? (await oneDevice()))
  const rows = await (await source()).lines(name)
  console.log(
    rows
      .slice(-(args.n ?? 50))
      .map((r) => r.line)
      .join('\n'),
  )
} else if (args.cmd === 'wait') {
  const name = args.to ?? (await oneDevice())
  const devices = await client.devices()
  const seq = devices.find((d) => d.name === name)?.seq ?? 0
  console.log(JSON.stringify(await client.waitFor(name, String(args.args.event), seq, args.timeoutMs), null, 2))
} else if (args.cmd === 'report' || args.cmd === 'verdict' || args.cmd === 'calibrations') {
  // Reads the store, not the dev server: works with it down, on yesterday's logs, and on the testers' with --remote.
  const name = String(args.args.name ?? (await oneDevice()))
  const text = await textOf(await source(), name)
  if (!text) throw new Error(`no line for device "${name}"`)
  const report = deviceReport(name, text, deps, args.n ?? 50)
  if (args.cmd === 'report') console.log(formatTable([...report.sessions].reverse()))
  else if (args.cmd === 'verdict') {
    const a = report.sessions[0]
    if (!a) throw new Error(`no session for device "${name}"`)
    console.log(formatVerdict(a))
  } else console.log(formatCalibrations(report.calibrations, report.budget))
} else if (args.cmd === 'feedback') {
  // Every comment in the store with the session it belongs to, newest first: one device when named, else all.
  const src = await source()
  const names = args.args.name ? [String(args.args.name)] : (await src.devices()).map((d) => d.name)
  const files: { device: string; text: string }[] = []
  for (const device of names) files.push({ device, text: await textOf(src, device) })
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
} else if (args.cmd === 'devices') {
  const src = await source()
  if (args.args.sub === 'ls') {
    const all = await src.devices()
    if (all.length === 0) console.log('no device yet')
    for (const d of all)
      console.log(`${d.name}\t${d.lines} lines\t${(d.bytes / 1024).toFixed(0)} KB\tlast ${d.lastAt ?? '—'}\t${d.id}`)
  } else {
    const d = await src.createDevice(safeName(String(args.args.name)))
    // The link is the tester's whole onboarding: open it once, the page keeps the key.
    console.log(`${d.name}\t${args.remote ? REMOTE_URL : DEFAULT_URL}/?tester=${d.key}`)
  }
} else if (args.cmd === 'export') {
  if (args.remote) throw new Error('export reads the local store: run sync first')
  const name = String(args.args.name)
  const path = args.args.path ? String(args.args.path) : `.remote/${name}.ndjson`
  const text = await textOf(await source(), name)
  // The fixtures sit at the default path: writeExported's own exclusive write is the guard, atomically —
  // never a check-then-write window where something else could create the file in between.
  await writeExported(path, text, args.force)
  console.log(`exported ${text ? text.trimEnd().split('\n').length : 0} lines to ${path}`)
} else if (args.cmd === 'import') {
  if (args.remote) throw new Error('import writes the local store only')
  const store = await openDevStore()
  const name = safeName(String(args.as))
  const lines = parseNdjson(await readFile(String(args.args.file), 'utf8'))
  const row = (await store.deviceByName(name)) ?? (await store.createDevice(name))
  const last = await store.lastSeq(row.id)
  const rows = args.renumber ? renumbered(lines, last) : numbered(lines)
  try {
    await store.appendNumbered(row.id, rows)
  } catch (err) {
    if (err instanceof SeqError)
      throw new Error(
        `${err.message}; "${name}" already holds lines up to ${last}: import under a fresh name, or --renumber`,
      )
    throw err
  }
  console.log(`imported ${rows.length} lines into ${name}${args.renumber ? ` (renumbered from ${last + 1})` : ''}`)
} else if (args.cmd === 'sync') {
  const synced = await syncDevices(remoteSource(), await openDevStore())
  if (synced.length === 0) console.log('no device on the remote store')
  for (const s of synced) console.log(`${s.name}\t+${s.added}${s.added ? `\tseq ${s.from + 1}..${s.to}` : ''}`)
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
