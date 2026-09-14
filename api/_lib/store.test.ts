import { beforeEach, describe, expect, it } from 'bun:test'
import { isKey } from './names'
import {
  checkNumbered,
  memoryStore,
  NameTakenError,
  type NumberedLine,
  SeqError,
  type Store,
  sqlStore,
  UnknownDeviceError,
} from './store'

// One suite, two backends: the SQL text runs on SQLite here and on Postgres in production, and the schema
// is written in the dialect-neutral subset on purpose. Memory is what the handler tests use.
const backends: [string, () => Store][] = [
  ['memory', memoryStore],
  ['sqlite', () => sqlStore('sqlite://:memory:')],
]

for (const [label, make] of backends) {
  describe(`store (${label})`, () => {
    let store: Store
    beforeEach(async () => {
      store = make()
      await store.ensureSchema()
    })

    it('creates a device with a fresh key and finds it by key and by name', async () => {
      const d = await store.createDevice('marco')
      expect(d.name).toBe('marco')
      expect(isKey(d.key)).toBe(true)
      expect(await store.deviceByKey(d.key)).toEqual(d)
      expect(await store.deviceByName('marco')).toEqual(d)
      expect(await store.deviceByKey('0'.repeat(32))).toBeNull()
      expect(await store.deviceByName('nobody')).toBeNull()
      expect(store.createDevice('marco')).rejects.toBeInstanceOf(NameTakenError)
    })

    it('keeps the id it is given (sync mirrors a remote device under its own id)', async () => {
      const d = await store.createDevice('ipad', 'fixed-id')
      expect(d.id).toBe('fixed-id')
    })

    it('numbers appended lines per device from 1, stamps seq and receivedAt inside, reads since/limit', async () => {
      const a = await store.createDevice('a')
      const b = await store.createDevice('b')
      const one = await store.append(a.id, [{ event: 'hello' }, { event: 'hit', t: 1.5 }], '2026-09-13T10:00:00.000Z')
      expect(one).toMatchObject({ first: 1, last: 2 })
      expect(JSON.parse(one.raws[1])).toEqual({ event: 'hit', t: 1.5, seq: 2, receivedAt: '2026-09-13T10:00:00.000Z' })
      const two = await store.append(a.id, [{ event: 'output' }], '2026-09-13T10:00:01.000Z')
      expect(two).toMatchObject({ first: 3, last: 3 })
      expect(await store.append(b.id, [{ event: 'hello' }], '2026-09-13T10:00:02.000Z')).toMatchObject({
        first: 1,
        last: 1,
      })
      expect(await store.lastSeq(a.id)).toBe(3)
      const rows = await store.read(a.id, 1, 10)
      expect(rows.map((r) => r.seq)).toEqual([2, 3])
      expect(JSON.parse(rows[0].line).event).toBe('hit')
      expect((await store.read(a.id, 0, 2)).map((r) => r.seq)).toEqual([1, 2])
      expect(await store.read(a.id, 3, 10)).toEqual([])
    })

    it('stores a batch once per id: a resend appends nothing and reports the range the first one got', async () => {
      const d = await store.createDevice('marco')
      const batch = [{ event: 'session:start' }, { event: 'hit', t: 1 }]
      expect(await store.append(d.id, batch, 'r1', 'page7-1')).toMatchObject({ first: 1, last: 2, duplicate: false })
      // The delivery landed; its answer did not. The page sends the identical batch again.
      const again = await store.append(d.id, batch, 'r2', 'page7-1')
      expect(again).toMatchObject({ first: 1, last: 2, duplicate: true })
      expect(again.raws).toEqual([])
      expect(await store.lastSeq(d.id)).toBe(2)
      expect((await store.read(d.id, 0, 10)).length).toBe(2)
      // The id is scoped to the device, and a new id is a new batch.
      expect(await store.append(d.id, batch, 'r3', 'page7-2')).toMatchObject({ first: 3, last: 4 })
      const other = await store.createDevice('ipad')
      expect(await store.append(other.id, batch, 'r4', 'page7-1')).toMatchObject({ first: 1, last: 2 })
      // Without an id there is nothing to dedupe on: `/api/feedback` and the dev channel's audio line
      // append blindly, and must keep doing so.
      await store.append(d.id, [{ event: 'session:feedback' }], 'r5')
      await store.append(d.id, [{ event: 'session:feedback' }], 'r6')
      expect(await store.lastSeq(d.id)).toBe(6)
    })

    it('refuses an unknown device and an empty batch', async () => {
      expect(store.append('nope', [{ event: 'x' }], 'now')).rejects.toBeInstanceOf(UnknownDeviceError)
      expect(store.lastSeq('nope')).rejects.toBeInstanceOf(UnknownDeviceError)
      const d = await store.createDevice('d')
      expect(store.append(d.id, [], 'now')).rejects.toThrow('at least one line')
    })

    it('appendNumbered stores rows byte for byte and continues the numbering after them', async () => {
      const d = await store.createDevice('mirror', 'm1')
      await store.appendNumbered(d.id, [
        { seq: 1, receivedAt: 'r1', line: '{"event":"hello","seq":1,"receivedAt":"r1"}' },
        { seq: 3, receivedAt: 'r3', line: '{"event":"hit","seq":3,"receivedAt":"r3"}' },
      ])
      expect((await store.read(d.id, 0, 10)).map((r) => r.line)).toEqual([
        '{"event":"hello","seq":1,"receivedAt":"r1"}',
        '{"event":"hit","seq":3,"receivedAt":"r3"}',
      ])
      expect(await store.lastSeq(d.id)).toBe(3)
      expect(await store.append(d.id, [{ event: 'x' }], 'r4')).toMatchObject({ first: 4, last: 4 })
      expect(store.appendNumbered(d.id, [{ seq: 4, receivedAt: 'r', line: '{}' }])).rejects.toBeInstanceOf(SeqError)
      expect(
        store.appendNumbered(d.id, [
          { seq: 6, receivedAt: 'r', line: '{}' },
          { seq: 5, receivedAt: 'r', line: '{}' },
        ]),
      ).rejects.toBeInstanceOf(SeqError)
      // Nothing of a rejected batch lands.
      expect(await store.lastSeq(d.id)).toBe(4)
      expect((await store.read(d.id, 4, 10)).length).toBe(0)
      await store.appendNumbered(d.id, [])
    })

    it('summarises devices by name with counts, bytes and last seq/receivedAt', async () => {
      const z = await store.createDevice('zed')
      const a = await store.createDevice('alpha')
      await store.append(a.id, [{ event: 'hello' }, { event: 'hit' }], '2026-09-13T10:00:00.000Z')
      const all = await store.devices()
      expect(all.map((d) => d.name)).toEqual(['alpha', 'zed'])
      const [alpha, zed] = all
      expect(alpha).toMatchObject({ id: a.id, lastSeq: 2, lastAt: '2026-09-13T10:00:00.000Z', lines: 2 })
      const raws = (await store.read(a.id, 0, 10)).map((r) => r.line)
      expect(alpha.bytes).toBe(raws[0].length + raws[1].length)
      expect(zed).toMatchObject({ id: z.id, lastSeq: 0, lastAt: null, lines: 0, bytes: 0 })
      expect('key' in alpha).toBe(false)
    })
  })
}

describe('checkNumbered', () => {
  const row = (seq: number): NumberedLine => ({ seq, receivedAt: 'r', line: '{}' })

  it('accepts rows whose seq climbs strictly from after, rejects otherwise', () => {
    expect(() => checkNumbered([row(1), row(2)], 0)).not.toThrow()
    expect(() => checkNumbered([], 5)).not.toThrow()
    expect(() => checkNumbered([row(1)], 1)).toThrow(SeqError)
    expect(() => checkNumbered([row(2), row(1)], 0)).toThrow(SeqError)
    expect(() => checkNumbered([row(1.5)], 0)).toThrow(SeqError)
  })
})
