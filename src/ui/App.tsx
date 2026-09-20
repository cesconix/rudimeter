import { useEffect, useMemo, useState } from 'react'
import type { Remote } from '../dev/remote'
import { remoteNameFrom } from '../dev/remote-name'
import { APP_INFO } from '../telemetry/app-info'
import type { Telemetry } from '../telemetry/client'
import { forgetTester, readTester, rememberTester, type Tester, withoutTester } from '../telemetry/tester'
import { ScoreScreen } from './ScoreScreen'

/**
 * The shell: the score screen, plus the plumbing that lets a page be seen from the Mac (the
 * `?remote` channel, dev server only) or share what it does with the store behind rudimeter.com
 * (a `?tester=` key). The session flow — microphone, calibration, judge — lives on
 * dev/session.html until it comes back on top of the score; its events simply never fire here.
 */
export function App() {
  // `?remote[=name]`, dev server only: the client is loaded on demand so that none of it is in the production bundle.
  const remoteName = useMemo(
    () =>
      import.meta.env.DEV
        ? remoteNameFrom(window.location.search, navigator.userAgent, 'ontouchend' in document)
        : null,
    [],
  )
  // `?tester=<key>` or the stored one. Read once, and the key leaves the URL at once: it is a secret,
  // and the address bar is no place for it.
  const tester = useMemo<Tester | null>(() => {
    const t = readTester(window.location.search, localStorage)
    if (t && new URLSearchParams(window.location.search).has('tester'))
      window.history.replaceState(null, '', withoutTester(window.location.href))
    return t
  }, [])
  const [remote, setRemote] = useState<Remote | null>(null)
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null)
  // The name the server settled on, which is not always the one asked for. A tester's stored name
  // shows at once; the dev channel settles at hello.
  const [settledName, setSettledName] = useState<string | null>(() => (remoteName ? null : (tester?.name ?? null)))
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let t: Telemetry | null = null
    let cancelled = false
    const say = (text: string, seconds: number) => {
      setNotice(text)
      window.setTimeout(() => setNotice((n) => (n === text ? null : n)), seconds * 1000)
    }
    if (import.meta.env.DEV && remoteName) {
      // The `import()` sits inside a bare `import.meta.env.DEV` block and not behind `remoteName`
      // alone: Vite rewrites the flag to `false` when building and the bundler drops a statically
      // false branch whole, dynamic import included. `remoteName` is a runtime value, so guarding on
      // it proves nothing to the bundler and the client shipped anyway as its own production chunk.
      import('../dev/remote').then((m) => {
        if (cancelled) return
        const r = m.connectRemote(remoteName, navigator.userAgent, { onName: setSettledName })
        m.registerBasics(r, say)
        t = r
        setRemote(r)
        setTelemetry(r)
      })
    } else if (tester) {
      // Not behind the DEV guard on purpose: this chunk ships, and loads only on a page that has a key.
      import('../telemetry/client').then((m) => {
        if (cancelled) return
        t = m.connectTelemetry({
          name: tester.name ?? '…',
          endpoint: () => m.apiLogEndpoint(tester.key),
          flushMs: 2000,
          onName: (name) => {
            setSettledName(name)
            rememberTester(localStorage, { key: tester.key, name })
          },
        })
        t.log('hello', { ua: navigator.userAgent, url: window.location.href, app: APP_INFO })
        setTelemetry(t)
      })
    }
    return () => {
      cancelled = true
      t?.close()
    }
  }, [remoteName, tester])

  const stopSharing = () => {
    forgetTester(localStorage)
    telemetry?.close()
    setTelemetry(null)
    setSettledName(null)
  }
  const telemetryBadge =
    telemetry &&
    (remote ? (
      <p className="synth-badge">Remote · {settledName ?? `${remoteName}…`}</p>
    ) : (
      <p className="synth-badge">
        Sharing as {settledName ?? '…'} — what the page does, never audio.{' '}
        <button type="button" className="secondary" onClick={stopSharing}>
          Stop
        </button>
      </p>
    ))
  const overlay = notice && <p className="big notice">{notice}</p>

  return (
    <>
      {telemetryBadge}
      {overlay}
      <ScoreScreen />
    </>
  )
}
