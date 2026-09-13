// Who is asking. Today: the admin (the dashboard's cookie or the CLI's bearer token) or nobody; a device
// key on `/api/log` is checked in the handler, not here. When accounts arrive, a user session lands here
// and nowhere else.
import { timingSafeEqual } from 'node:crypto'

export type Principal = 'admin' | null

export const COOKIE = 'rudimeter_admin'
/** 90 days: the dashboard is opened from one Mac and one iPad; a shorter life would only mean retyping the token. */
export const COOKIE_MAX_AGE_S = 90 * 24 * 3600

/** Constant time: a `===` on the token leaks its length and the first differing byte through timing. */
export function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/**
 * `adminToken === null` is the Vite plugin on the Mac, where the admin is whoever runs the dev server.
 * Production never passes null: `server.ts` refuses to start without `DASHBOARD_TOKEN`.
 */
export function principal(req: Request, adminToken: string | null): Principal {
  if (adminToken === null) return 'admin'
  const auth = req.headers.get('authorization') ?? ''
  const given = auth.startsWith('Bearer ')
    ? auth.slice('Bearer '.length)
    : readCookie(req.headers.get('cookie') ?? '', COOKIE)
  return given !== null && sameToken(given, adminToken) ? 'admin' : null
}

export const loginCookie = (token: string): string =>
  `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_S}`
export const logoutCookie = (): string => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
