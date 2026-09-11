/**
 * `?remote` or `?remote=<name>`. Null when the flag is absent: the remote layer stays off and none of
 * its code is loaded. iPadOS Safari presents itself as a Macintosh: the touch capability tells them apart.
 */
export function remoteNameFrom(search: string, ua: string, touch: boolean): string | null {
  const p = new URLSearchParams(search)
  if (!p.has('remote')) return null
  const explicit = p.get('remote')
  if (explicit) return explicit
  if (/iPhone/.test(ua)) return 'iphone'
  if (/iPad/.test(ua)) return 'ipad'
  if (/Macintosh/.test(ua)) return touch ? 'ipad' : 'mac'
  return 'device'
}
