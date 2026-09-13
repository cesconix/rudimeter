// The tester's opt-in: a link `?tester=<key>` from `bun run remote devices add`, kept in localStorage so
// every later visit shares its sessions too, until Stop. Pure against the URL and a storage: the tests
// hand it a Map-backed one, App.tsx hands it localStorage.
import type { KeyValueStore } from '../audio/storage'

export const TESTER_STORAGE_KEY = 'rudimeter.tester.v1'
const KEY_RE = /^[0-9a-f]{32}$/

export interface Tester {
  key: string
  /** The device name the server answered with; null until the first batch got through. */
  name: string | null
}

/** `?tester=<key>` wins and is stored; else the stored one; else null. A malformed key is ignored. */
export function readTester(search: string, storage: KeyValueStore): Tester | null {
  const fromUrl = new URLSearchParams(search).get('tester')
  if (fromUrl !== null && KEY_RE.test(fromUrl)) {
    const t = { key: fromUrl, name: null }
    rememberTester(storage, t)
    return t
  }
  try {
    const raw = storage.getItem(TESTER_STORAGE_KEY)
    if (raw === null) return null
    const t = JSON.parse(raw) as Partial<Tester>
    return typeof t.key === 'string' && KEY_RE.test(t.key)
      ? { key: t.key, name: typeof t.name === 'string' ? t.name : null }
      : null
  } catch {
    return null
  }
}

/** Private Safari throws on setItem: the tester then shares this visit only, and the page must not die for it. */
export function rememberTester(storage: KeyValueStore, t: Tester): void {
  try {
    storage.setItem(TESTER_STORAGE_KEY, JSON.stringify(t))
  } catch {
    // Storing it is a convenience, not a requirement.
  }
}

export function forgetTester(storage: KeyValueStore): void {
  storage.removeItem(TESTER_STORAGE_KEY)
}

/** The same URL without the key: it must not sit in the address bar, the history or a screenshot. */
export function withoutTester(href: string): string {
  const u = new URL(href)
  u.searchParams.delete('tester')
  return u.toString()
}
