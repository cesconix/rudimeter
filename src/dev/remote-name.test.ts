import { describe, expect, it } from 'bun:test'
import { remoteNameFrom } from './remote-name'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15'
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'

describe('remoteNameFrom', () => {
  it('off without the flag', () => {
    expect(remoteNameFrom('?synth=42', IPHONE, true)).toBeNull()
    expect(remoteNameFrom('', CHROME_MAC, false)).toBeNull()
  })
  it('takes the explicit name', () => {
    expect(remoteNameFrom('?remote=desk', CHROME_MAC, false)).toBe('desk')
  })
  it('guesses iphone, ipad (a Mac with touch), mac, device', () => {
    expect(remoteNameFrom('?remote', IPHONE, true)).toBe('iphone')
    expect(remoteNameFrom('?remote', IPAD_AS_MAC, true)).toBe('ipad')
    expect(remoteNameFrom('?remote', CHROME_MAC, false)).toBe('mac')
    expect(remoteNameFrom('?remote', 'Mozilla/5.0 (X11; Linux x86_64)', false)).toBe('device')
  })
})
