/** Where an event sits in the WRITTEN score. `item` indexes `Bar.items`; `sub` the position inside a tuplet group. */
export interface EventId {
  bar: number
  item: number
  sub?: number
}

export function keyOf(id: EventId): string {
  const base = `b${id.bar}/${id.item}`
  return id.sub === undefined ? base : `${base}.${id.sub}`
}

const KEY = /^b(\d+)\/(\d+)(?:\.(\d+))?$/

export function parseKey(key: string): EventId {
  const m = KEY.exec(key)
  if (!m) throw new Error(`invalid event key: "${key}"`)
  const id: EventId = { bar: Number(m[1]), item: Number(m[2]) }
  if (m[3] !== undefined) id.sub = Number(m[3])
  return id
}

/** The same written event played on pass 2 of a repeat is another moment: the pass is part of the playback key. */
export const playbackKey = (id: EventId, pass: number): string => `${keyOf(id)}@${pass}`
