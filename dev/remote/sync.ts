// Mirrors the production store into the local one: every device, every line after the last seq the
// local copy holds. Byte for byte and under the same ids, so `report`, `verdict` and `feedback` read the
// testers' sessions offline with the numbers the hosted dashboard shows.
import type { Store } from '../../api/_lib/store'
import { receivedAtOf } from './ndjson'
import type { Source } from './source'

export interface SyncedDevice {
  name: string
  added: number
  from: number
  to: number
}

export async function syncDevices(remote: Source, local: Store): Promise<SyncedDevice[]> {
  const out: SyncedDevice[] = []
  for (const d of await remote.devices()) {
    const mine = await local.deviceByName(d.name)
    // A LAN device named like a tester would swallow the tester's lines under another id: refuse.
    if (mine && mine.id !== d.id)
      throw new Error(
        `local device "${d.name}" (${mine.id}) is not the remote one (${d.id}): pick another tester name, local devices cannot be renamed`,
      )
    const row = mine ?? (await local.createDevice(d.name, d.id))
    const since = await local.lastSeq(row.id)
    const rows = await remote.lines(d.name, since)
    if (rows.length)
      await local.appendNumbered(
        row.id,
        rows.map((r) => ({
          seq: r.seq,
          receivedAt: receivedAtOf(JSON.parse(r.line) as Record<string, unknown>),
          line: r.line,
        })),
      )
    out.push({ name: d.name, added: rows.length, from: since, to: rows.length ? rows[rows.length - 1].seq : since })
  }
  return out
}
