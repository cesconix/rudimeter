/** `iphone`, then `iphone-2`, `iphone-3`: a second page from the same phone gets its own name and its own file. */
export function uniqueName(wanted: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(wanted)) return wanted
  for (let i = 2; ; i++) {
    const candidate = `${wanted}-${i}`
    if (!set.has(candidate)) return candidate
  }
}

/** Which device a command goes to. One connected and no `to`: that one. Otherwise `to` must name one: never a guess. */
export function resolveTarget(
  to: string | null,
  names: string[],
): { ok: true; name: string } | { ok: false; error: string } {
  if (to !== null) {
    return names.includes(to)
      ? { ok: true, name: to }
      : { ok: false, error: `no device "${to}"; connected: ${names.join(', ') || 'none'}` }
  }
  if (names.length === 1) return { ok: true, name: names[0] }
  if (names.length === 0) return { ok: false, error: 'no device connected' }
  return { ok: false, error: `several devices connected, pass --to: ${names.join(', ')}` }
}

/** A file stem that cannot leave `.remote/`: lowercase letters, digits, dashes; 40 chars at most; never empty. */
export function safeName(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || 'device'
}

/**
 * The highest `seq` already on disk, so a restarted dev server keeps numbering where the file stopped
 * instead of starting at 1 again (two runs in one file share `seq` values, and an analysis by `seq`
 * mixes days — it did on 2026-09-12). Walks back from the end: the last line can be torn mid-write.
 */
export function lastSeqOf(text: string): number {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i].trim()
    if (!raw) continue
    try {
      const seq = (JSON.parse(raw) as { seq?: unknown }).seq
      return typeof seq === 'number' && Number.isFinite(seq) ? seq : 0
    } catch {
      // torn line: keep walking back
    }
  }
  return 0
}
