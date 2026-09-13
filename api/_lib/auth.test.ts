import { describe, expect, it } from 'bun:test'
import { COOKIE, COOKIE_MAX_AGE_S, loginCookie, logoutCookie, principal, readCookie, sameToken } from './auth'

const req = (headers: Record<string, string> = {}) => new Request('https://x/api/devices', { headers })

describe('sameToken', () => {
  it('equal, different, different length', () => {
    expect(sameToken('abc', 'abc')).toBe(true)
    expect(sameToken('abc', 'abd')).toBe(false)
    expect(sameToken('ab', 'abc')).toBe(false)
    expect(sameToken('', '')).toBe(true)
  })
})

describe('readCookie', () => {
  it('finds a cookie among others, keeps "=" inside the value, null when absent', () => {
    expect(readCookie('a=1; rudimeter_admin=t=ok; b=2', 'rudimeter_admin')).toBe('t=ok')
    expect(readCookie('a=1', 'rudimeter_admin')).toBeNull()
    expect(readCookie('', 'rudimeter_admin')).toBeNull()
  })
})

describe('principal', () => {
  it('bearer or cookie with the right token is admin; anything else is nobody', () => {
    expect(principal(req({ authorization: 'Bearer secret' }), 'secret')).toBe('admin')
    expect(principal(req({ cookie: 'rudimeter_admin=secret' }), 'secret')).toBe('admin')
    expect(principal(req({ authorization: 'Bearer nope' }), 'secret')).toBeNull()
    expect(principal(req({ cookie: 'rudimeter_admin=nope' }), 'secret')).toBeNull()
    expect(principal(req(), 'secret')).toBeNull()
  })
  it('a null token (dev server) makes everyone admin', () => {
    expect(principal(req(), null)).toBe('admin')
  })
  it('cookies carry HttpOnly, Secure, SameSite=Strict and a 90-day or zero Max-Age', () => {
    expect(loginCookie('t')).toBe('rudimeter_admin=t; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7776000')
    expect(logoutCookie()).toContain('Max-Age=0')
  })
  it('names the cookie and its lifetime the same way readCookie and the dashboard expect', () => {
    expect(COOKIE).toBe('rudimeter_admin')
    expect(COOKIE_MAX_AGE_S).toBe(90 * 24 * 3600)
  })
})
