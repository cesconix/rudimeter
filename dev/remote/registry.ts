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
