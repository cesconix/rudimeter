// The one place telemetry lines live: an append-only log per device, numbered per device. Two backends
// behind one interface — Postgres (Neon) in production, SQLite in `.remote/dev.db` on the Mac — plus an
// in-memory one for the tests. The schema is dialect-neutral on purpose (TEXT and INTEGER only): the line
// is kept as the JSON text the page sent, with `seq` and `receivedAt` stamped inside like the old
// `.remote/<device>.ndjson` lines had them, and is never queried inside — `src/analysis` reads it back whole.
import { SQL } from 'bun'
import { newKey } from './names'

export interface DeviceRow {
  id: string
  name: string
  /** The secret in a tester's link (`?tester=<key>`): whoever has it writes as this device. */
  key: string
  createdAt: string
}

export interface DeviceSummary {
  id: string
  name: string
  createdAt: string
  lastSeq: number
  lastAt: string | null
  lines: number
  bytes: number
}

export interface NumberedLine {
  seq: number
  receivedAt: string
  line: string
}

export interface Appended {
  first: number
  last: number
  /** The lines as stored, `seq` and `receivedAt` inside, in order. Empty on a `duplicate`. */
  raws: string[]
  /**
   * The `batchId` was already stored for this device, so nothing was appended and the range is the one
   * the first delivery got. Delivery is at least once — a batch the store committed can still lose its
   * answer on the way back — and without this the analysis reads the resend as strokes that were played.
   */
  duplicate: boolean
}

export class NameTakenError extends Error {
  constructor(name: string) {
    super(`device name "${name}" is taken`)
  }
}
export class UnknownDeviceError extends Error {
  constructor(id: string) {
    super(`unknown device id ${id}`)
  }
}
export class SeqError extends Error {}

export interface Store {
  ensureSchema(): Promise<void>
  deviceByKey(key: string): Promise<DeviceRow | null>
  deviceByName(name: string): Promise<DeviceRow | null>
  /** `name` is stored as given: callers pass `safeName(...)`. `id` is for `sync`, which mirrors a remote device under its own id. */
  createDevice(name: string, id?: string): Promise<DeviceRow>
  devices(): Promise<DeviceSummary[]>
  /** The highest `seq` handed out for the device: 0 before its first line. */
  lastSeq(deviceId: string): Promise<number>
  /**
   * Numbers and stores: stamps `seq` and `receivedAt` into every object, in order. Atomic per device.
   * With a `batchId`, at most once: a second call under the same id for the same device stores nothing
   * and reports the first one's range. The id and the lines commit together.
   */
  append(deviceId: string, fields: Record<string, unknown>[], receivedAt: string, batchId?: string): Promise<Appended>
  /** For `sync` and `import`: lines already numbered, stored byte for byte. `seq` must climb strictly and start above `lastSeq`. */
  appendNumbered(deviceId: string, rows: NumberedLine[]): Promise<void>
  read(deviceId: string, since: number, limit: number): Promise<{ seq: number; line: string }[]>
  close(): Promise<void>
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    next_seq INTEGER NOT NULL DEFAULT 0,
    user_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS lines (
    device_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    line TEXT NOT NULL,
    PRIMARY KEY (device_id, seq)
  )`,
  // What a batch got the first time it landed, so a resend can be answered instead of appended. The
  // primary key is the uniqueness constraint; it needs no dialect-specific syntax and it is also the
  // index the lookup uses.
  `CREATE TABLE IF NOT EXISTS batches (
    device_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    first_seq INTEGER NOT NULL,
    last_seq INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY (device_id, batch_id)
  )`,
]

/** Rejects rows that would not climb strictly from `after`: `seq` is what the analysis orders by. */
export function checkNumbered(rows: NumberedLine[], after: number): void {
  let prev = after
  for (const [i, r] of rows.entries()) {
    if (!Number.isInteger(r.seq) || r.seq <= prev)
      throw new SeqError(`row ${i + 1}: seq ${r.seq} must be an integer above ${prev}`)
    prev = r.seq
  }
}

interface DeviceRecord {
  id: string
  name: string
  key: string
  created_at: string
}
const toRow = (r: DeviceRecord): DeviceRow => ({ id: r.id, name: r.name, key: r.key, createdAt: r.created_at })

/** `sqlite://<absolute path>` or `sqlite://:memory:` on the Mac, `postgresql://…` on Vercel: same code. */
export function sqlStore(url: string): Store {
  const sql = new SQL(url)
  const sqlite = url.startsWith('sqlite:')

  async function deviceByName(name: string): Promise<DeviceRow | null> {
    const [r] = await sql`SELECT id, name, key, created_at FROM devices WHERE name = ${name}`
    return r ? toRow(r as DeviceRecord) : null
  }

  return {
    async ensureSchema() {
      // The plugin writes while the CLI reads the same file: WAL lets the two overlap.
      if (sqlite) await sql.unsafe('PRAGMA journal_mode = WAL')
      for (const ddl of DDL) await sql.unsafe(ddl)
    },
    async deviceByKey(key) {
      const [r] = await sql`SELECT id, name, key, created_at FROM devices WHERE key = ${key}`
      return r ? toRow(r as DeviceRecord) : null
    },
    deviceByName,
    async createDevice(name, id = crypto.randomUUID()) {
      if (await deviceByName(name)) throw new NameTakenError(name)
      const d: DeviceRow = { id, name, key: newKey(), createdAt: new Date().toISOString() }
      await sql`INSERT INTO devices (id, name, key, created_at) VALUES (${d.id}, ${d.name}, ${d.key}, ${d.createdAt})`
      return d
    },
    async devices() {
      const rows = (await sql`
        SELECT d.id, d.name, d.created_at,
               coalesce(max(l.seq), 0) AS last_seq, max(l.received_at) AS last_at,
               count(l.seq) AS lines, coalesce(sum(length(l.line)), 0) AS bytes
        FROM devices d LEFT JOIN lines l ON l.device_id = d.id
        GROUP BY d.id, d.name, d.created_at
        ORDER BY d.name`) as {
        id: unknown
        name: unknown
        created_at: unknown
        last_seq: unknown
        last_at: unknown
        lines: unknown
        bytes: unknown
      }[]
      // count/sum come back as bigint or numeric depending on the dialect: normalise to numbers.
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        createdAt: String(r.created_at),
        lastSeq: Number(r.last_seq),
        lastAt: r.last_at === null || r.last_at === undefined ? null : String(r.last_at),
        lines: Number(r.lines),
        bytes: Number(r.bytes),
      }))
    },
    async lastSeq(deviceId) {
      const [r] = await sql`SELECT next_seq FROM devices WHERE id = ${deviceId}`
      if (!r) throw new UnknownDeviceError(deviceId)
      return Number(r.next_seq)
    },
    async append(deviceId, fields, receivedAt, batchId) {
      if (fields.length === 0) throw new Error('append needs at least one line')
      return sql.begin(async (tx) => {
        // Same transaction as the append below: a crash between the two would otherwise leave the store
        // holding lines it no longer recognises on the resend, or an id with nothing behind it.
        if (batchId !== undefined) {
          const [seen] = await tx`
            SELECT first_seq, last_seq FROM batches WHERE device_id = ${deviceId} AND batch_id = ${batchId}`
          if (seen) return { first: Number(seen.first_seq), last: Number(seen.last_seq), raws: [], duplicate: true }
        }
        // The reservation is the lock: two batches for one device serialise on this row and each gets
        // its own range. No `max(seq)` read that a concurrent writer could make stale.
        const [r] =
          await tx`UPDATE devices SET next_seq = next_seq + ${fields.length} WHERE id = ${deviceId} RETURNING next_seq`
        if (!r) throw new UnknownDeviceError(deviceId)
        const last = Number(r.next_seq)
        const first = last - fields.length + 1
        const rows = fields.map((f, i) => ({
          device_id: deviceId,
          seq: first + i,
          received_at: receivedAt,
          line: JSON.stringify({ ...f, seq: first + i, receivedAt }),
        }))
        await tx`INSERT INTO lines ${tx(rows)}`
        // Two copies of one batch arriving at once both miss the SELECT above; the primary key stops the
        // second and rolls its whole transaction back, lines included, so the client's next attempt finds
        // the winner's range here. The client keeps one batch in flight, so this is the rare path.
        if (batchId !== undefined)
          await tx`INSERT INTO batches (device_id, batch_id, first_seq, last_seq, received_at)
            VALUES (${deviceId}, ${batchId}, ${first}, ${last}, ${receivedAt})`
        return { first, last, raws: rows.map((x) => x.line), duplicate: false }
      })
    },
    async appendNumbered(deviceId, rows) {
      if (rows.length === 0) return
      await sql.begin(async (tx) => {
        const [r] = await tx`SELECT next_seq FROM devices WHERE id = ${deviceId}`
        if (!r) throw new UnknownDeviceError(deviceId)
        checkNumbered(rows, Number(r.next_seq))
        await tx`INSERT INTO lines ${tx(
          rows.map((x) => ({ device_id: deviceId, seq: x.seq, received_at: x.receivedAt, line: x.line })),
        )}`
        await tx`UPDATE devices SET next_seq = ${rows[rows.length - 1].seq} WHERE id = ${deviceId}`
      })
    },
    async read(deviceId, since, limit) {
      const rows = (await sql`
        SELECT seq, line FROM lines WHERE device_id = ${deviceId} AND seq > ${since} ORDER BY seq LIMIT ${limit}
      `) as { seq: unknown; line: unknown }[]
      return rows.map((r) => ({ seq: Number(r.seq), line: String(r.line) }))
    },
    close: () => sql.close(),
  }
}

export function memoryStore(): Store {
  const devices = new Map<string, DeviceRow & { nextSeq: number }>()
  const lines = new Map<string, NumberedLine[]>()
  /** `<device id> <batch id>` → the range that batch got: the `batches` table, in a Map. */
  const batches = new Map<string, { first: number; last: number }>()
  const get = (id: string) => {
    const d = devices.get(id)
    if (!d) throw new UnknownDeviceError(id)
    return d
  }
  const linesOf = (id: string): NumberedLine[] => {
    let ls = lines.get(id)
    if (!ls) {
      ls = []
      lines.set(id, ls)
    }
    return ls
  }
  const strip = ({ nextSeq: _, ...d }: DeviceRow & { nextSeq: number }): DeviceRow => d
  const byName = (name: string) => [...devices.values()].find((d) => d.name === name)
  return {
    async ensureSchema() {},
    async deviceByKey(key) {
      const d = [...devices.values()].find((x) => x.key === key)
      return d ? strip(d) : null
    },
    async deviceByName(name) {
      const d = byName(name)
      return d ? strip(d) : null
    },
    async createDevice(name, id = crypto.randomUUID()) {
      if (byName(name)) throw new NameTakenError(name)
      const d = { id, name, key: newKey(), createdAt: new Date().toISOString(), nextSeq: 0 }
      devices.set(id, d)
      return strip(d)
    },
    async devices() {
      return [...devices.values()]
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((d) => {
          const ls = linesOf(d.id)
          const last = ls[ls.length - 1]
          return {
            id: d.id,
            name: d.name,
            createdAt: d.createdAt,
            lastSeq: last?.seq ?? 0,
            lastAt: last?.receivedAt ?? null,
            lines: ls.length,
            bytes: ls.reduce((n, l) => n + l.line.length, 0),
          }
        })
    },
    async lastSeq(id) {
      return get(id).nextSeq
    },
    async append(id, fields, receivedAt, batchId) {
      if (fields.length === 0) throw new Error('append needs at least one line')
      const d = get(id)
      const key = batchId === undefined ? null : `${id} ${batchId}`
      const seen = key === null ? undefined : batches.get(key)
      if (seen) return { ...seen, raws: [], duplicate: true }
      const first = d.nextSeq + 1
      d.nextSeq += fields.length
      const raws = fields.map((f, i) => JSON.stringify({ ...f, seq: first + i, receivedAt }))
      linesOf(id).push(...raws.map((line, i) => ({ seq: first + i, receivedAt, line })))
      if (key !== null) batches.set(key, { first, last: d.nextSeq })
      return { first, last: d.nextSeq, raws, duplicate: false }
    },
    async appendNumbered(id, rows) {
      if (rows.length === 0) return
      const d = get(id)
      checkNumbered(rows, d.nextSeq)
      linesOf(id).push(...rows.map((r) => ({ ...r })))
      d.nextSeq = rows[rows.length - 1].seq
    },
    async read(id, since, limit) {
      return linesOf(id)
        .filter((l) => l.seq > since)
        .slice(0, limit)
        .map(({ seq, line }) => ({ seq, line }))
    },
    async close() {},
  }
}
