/** Where an event sits in the WRITTEN score. `item` indexes `Voice.items`; `sub` the position inside a tuplet group. */
export interface EventId {
  bar: number
  part: string
  voice: number
  item: number
  sub?: number
}

export function keyOf(id: EventId): string {
  const base = `b${id.bar}/${id.part}/${id.voice}/${id.item}`
  return id.sub === undefined ? base : `${base}.${id.sub}`
}

// Part ids are `[a-z0-9-]+` (validate enforces it) precisely so that a key splits on `/` without escaping.
const KEY = /^b(\d+)\/([a-z0-9-]+)\/(\d+)\/(\d+)(?:\.(\d+))?$/

export function parseKey(key: string): EventId {
  const m = KEY.exec(key)
  if (!m) throw new Error(`invalid event key: "${key}"`)
  const id: EventId = { bar: Number(m[1]), part: m[2], voice: Number(m[3]), item: Number(m[4]) }
  if (m[5] !== undefined) id.sub = Number(m[5])
  return id
}

/** The same written event played on pass 2 of a repeat is another moment: the pass is part of the playback key. */
export const playbackKey = (id: EventId, pass: number): string => `${keyOf(id)}@${pass}`
