/** A device name that is safe as a file stem and a URL value: lowercase letters, digits, dashes; 40 chars at most; never empty. */
export function safeName(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || 'device'
}

/** 16 random bytes as 32 hex chars: the secret in a tester's link. Whoever has it writes as that device. */
export function newKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const isKey = (s: string): boolean => /^[0-9a-f]{32}$/.test(s)
