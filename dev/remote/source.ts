// Where the CLI reads lines from: the local SQLite store opened directly (no dev server needed, the way
// `report` always read the file), or the production API over HTTP with the admin token (`--remote`).
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { type DeviceSummary, type Store, sqlStore } from '../../api/_lib/store'

export interface Source {
  devices(): Promise<DeviceSummary[]>
  /** Every line of `name` after `since`, in `seq` order; [] for a device the source does not know. */
  lines(name: string, since?: number): Promise<{ seq: number; line: string }[]>
  createDevice(name: string): Promise<{ id: string; name: string; key: string }>
}

export const DEV_DB = '.remote/dev.db'
/** One read per page: the store caps nothing, a day of `hit` lines is tens of thousands. */
const PAGE = 20000

/** Opens (and creates) the dev store where the plugin writes it, relative to the repo root. */
export async function openDevStore(path = DEV_DB): Promise<Store> {
  const abs = resolve(path)
  await mkdir(dirname(abs), { recursive: true })
  const store = sqlStore(`sqlite://${abs}`)
  await store.ensureSchema()
  return store
}

export function localSource(store: Store, page = PAGE): Source {
  return {
    devices: () => store.devices(),
    async lines(name, since = 0) {
      const d = await store.deviceByName(name)
      if (!d) return []
      const out: { seq: number; line: string }[] = []
      let from = since
      for (;;) {
        const rows = await store.read(d.id, from, page)
        out.push(...rows)
        if (rows.length < page) return out
        from = rows[rows.length - 1].seq
      }
    },
    createDevice: (name) => store.createDevice(name),
  }
}

export function httpSource(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch, page = PAGE): Source {
  const headers = { authorization: `Bearer ${token}` }
  async function check(res: Response): Promise<Response> {
    if (res.ok) return res
    const { error } = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `${res.status} ${res.statusText}`)
  }
  return {
    devices: async () =>
      (await (await check(await fetchImpl(`${baseUrl}/api/devices`, { headers }))).json()) as DeviceSummary[],
    async lines(name, since = 0) {
      const out: { seq: number; line: string }[] = []
      let from = since
      for (;;) {
        const res = await fetchImpl(
          `${baseUrl}/api/lines?device=${encodeURIComponent(name)}&since=${from}&limit=${page}`,
          { headers },
        )
        if (res.status === 404) return out
        const raws = (await (await check(res)).text()).split('\n').filter((r) => r.trim())
        // The line carries its own `seq` (stamped by the store): no need for the x-last-seq header here.
        for (const raw of raws) out.push({ seq: Number((JSON.parse(raw) as { seq?: unknown }).seq), line: raw })
        if (raws.length < page) return out
        from = out[out.length - 1].seq
      }
    },
    createDevice: async (name) =>
      (await (
        await check(
          await fetchImpl(`${baseUrl}/api/devices`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({ name }),
          }),
        )
      ).json()) as { id: string; name: string; key: string },
  }
}
