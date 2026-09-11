import { describe, expect, it } from 'bun:test'
import { resolveTarget, safeName, uniqueName } from './registry'

describe('uniqueName', () => {
  it('keeps a free name and numbers a taken one from 2', () => {
    expect(uniqueName('iphone', [])).toBe('iphone')
    expect(uniqueName('iphone', ['iphone'])).toBe('iphone-2')
    expect(uniqueName('iphone', ['iphone', 'iphone-2'])).toBe('iphone-3')
  })
})

describe('resolveTarget', () => {
  it('one device and no --to: that one', () => {
    expect(resolveTarget(null, ['ipad'])).toEqual({ ok: true, name: 'ipad' })
  })
  it('several devices and no --to: error listing them', () => {
    const r = resolveTarget(null, ['iphone', 'ipad'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('iphone, ipad')
  })
  it('no device: error', () => {
    expect(resolveTarget(null, []).ok).toBe(false)
  })
  it('--to must name a connected device', () => {
    expect(resolveTarget('ipad', ['iphone', 'ipad'])).toEqual({ ok: true, name: 'ipad' })
    expect(resolveTarget('watch', ['iphone']).ok).toBe(false)
  })
})

describe('safeName', () => {
  it('lowercase letters, digits and dashes only, never empty', () => {
    expect(safeName('iPhone di Francesco')).toBe('iphone-di-francesco')
    expect(safeName('../..')).toBe('device')
    expect(safeName('a'.repeat(60))).toHaveLength(40)
  })
})
