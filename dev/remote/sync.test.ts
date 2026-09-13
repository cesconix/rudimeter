import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../../api/_lib/store'
import type { Source } from './source'
import { syncDevices } from './sync'

const line = (seq: number) => JSON.stringify({ event: 'e', seq, receivedAt: `r${seq}` })
const remoteOf = (lines: Record<string, number[]>, ids: Record<string, string>): Source => ({
  devices: async () =>
    Object.keys(lines).map((name) => ({
      id: ids[name],
      name,
      createdAt: 'c',
      lastSeq: 0,
      lastAt: null,
      lines: 0,
      bytes: 0,
    })),
  lines: async (name, since = 0) =>
    (lines[name] ?? []).filter((s) => s > since).map((seq) => ({ seq, line: line(seq) })),
  createDevice: async () => {
    throw new Error('not in this test')
  },
})

describe('syncDevices', () => {
  it('mirrors every remote device under its own id, then only what is new', async () => {
    const local = memoryStore()
    const first = await syncDevices(remoteOf({ marco: [1, 2], ipad: [1] }, { marco: 'm', ipad: 'i' }), local)
    expect(first).toEqual([
      { name: 'marco', added: 2, from: 0, to: 2 },
      { name: 'ipad', added: 1, from: 0, to: 1 },
    ])
    expect((await local.deviceByName('marco'))?.id).toBe('m')
    expect((await local.read('m', 0, 10)).map((r) => r.line)).toEqual([line(1), line(2)])
    const second = await syncDevices(remoteOf({ marco: [1, 2, 3], ipad: [1] }, { marco: 'm', ipad: 'i' }), local)
    expect(second).toEqual([
      { name: 'marco', added: 1, from: 2, to: 3 },
      { name: 'ipad', added: 0, from: 1, to: 1 },
    ])
    expect(await local.lastSeq('m')).toBe(3)
  })
  it('refuses a local device of the same name with another id', async () => {
    const local = memoryStore()
    await local.createDevice('marco', 'other')
    expect(syncDevices(remoteOf({ marco: [1] }, { marco: 'm' }), local)).rejects.toThrow('is not the remote one')
  })
})
