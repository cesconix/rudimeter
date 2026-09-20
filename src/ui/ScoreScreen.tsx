import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { audibleTime } from '../audio/clock'
import { createAudioContext, ensureRunning } from '../audio/context'
import { type Clock, Transport } from '../audio/transport'
import { SCORES } from '../data/scores'
import type { Prefs } from '../notation/fit'
import { loadPrefs, savePrefs, type ViewPrefs } from './prefs'
import { ScorePicker } from './ScorePicker'
import { ScoreView } from './ScoreView'
import { TransportBar } from './TransportBar'

/**
 * The app's one screen: the picker, the score, the transport bar. Owns the audio context (created
 * on the first Play, inside the gesture — iOS starts a context only there; no node, it is a clock),
 * the transport of the current piece and the preferences.
 */
export function ScoreScreen() {
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadPrefs(localStorage))
  const [scoreId, setScoreId] = useState(SCORES[0].id)
  const score = SCORES.find((s) => s.id === scoreId) ?? SCORES[0]
  // The context in a ref for the clock (read every frame, never a re-render) and in state for the
  // effect that listens to it: state, because the effect must re-run once the first Play created it.
  const ctxRef = useRef<AudioContext | null>(null)
  const [ctx, setCtx] = useState<AudioContext | null>(null)
  const [suspended, setSuspended] = useState(false)
  const [bar, setBar] = useState(0)
  // Reads the context through the ref: the transport is built before the context exists, and
  // until the first Play `currentTime` is 0 — the transport holds still on it.
  const clock = useMemo<Clock>(
    () => ({
      get currentTime() {
        return ctxRef.current?.currentTime ?? 0
      },
    }),
    [],
  )
  // One transport per piece; the bpm follows the preferences from then on (see `update`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: prefs.bpm seeds the transport, it does not rebuild it — setBpm keeps the position.
  const transport = useMemo(() => new Transport(clock, score, prefs.bpm), [clock, score])
  // Only the two layout preferences reach the view: a new object there is a re-layout, and a bpm change must not be one.
  const layoutPrefs = useMemo<Prefs>(
    () => ({ barsPerRow: prefs.barsPerRow, rowsPerViewport: prefs.rowsPerViewport }),
    [prefs.barsPerRow, prefs.rowsPerViewport],
  )
  // The AUDIBLE clock for the drawing (src/audio/clock.ts): the cursor stays with the sound going out.
  const now = useCallback(() => (ctxRef.current ? audibleTime(ctxRef.current) : 0), [])

  // iOS suspends the context after lock/background: the banner says so and a tap resumes it.
  useEffect(() => {
    if (!ctx) return
    const check = () => setSuspended(ctx.state !== 'running')
    ctx.addEventListener('statechange', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      ctx.removeEventListener('statechange', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [ctx])

  const play = async () => {
    try {
      let c = ctxRef.current
      if (!c) {
        // Inside the try: Web Audio unsupported (or blocked) throws here, and without a context
        // there is nothing to resume — the banner is still the honest state to land in, not a
        // silently rejected `play()`.
        c = createAudioContext()
        ctxRef.current = c
        setCtx(c)
      }
      await ensureRunning(c)
    } catch {
      // Safari rejects `resume()` when it decides the call falls outside the gesture: surface the
      // same banner a later suspend shows, instead of leaving an unhandled rejection and a silent Play.
      setSuspended(true)
      return
    }
    transport.play()
  }

  const update = (patch: Partial<ViewPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    savePrefs(localStorage, next)
    if (patch.bpm !== undefined) transport.setBpm(patch.bpm)
  }

  const pick = (id: string) => {
    transport.stop()
    setScoreId(id)
    setBar(0)
  }

  return (
    <main className="score-screen">
      <div className="row">
        <ScorePicker value={scoreId} onChange={pick} />
        {suspended && ctx && (
          <button
            type="button"
            onClick={() =>
              // A rejection here (the same Safari gesture rule as `play`'s) must not escape as an
              // unhandled rejection: the banner just stays up, which is already the honest state.
              ctx
                .resume()
                .then(() => setSuspended(false))
                .catch(() => setSuspended(true))
            }
          >
            Audio paused: tap to resume
          </button>
        )}
      </div>
      <ScoreView score={score} transport={transport} now={now} mode={prefs.mode} prefs={layoutPrefs} onBar={setBar} />
      <TransportBar
        transport={transport}
        bar={bar}
        bars={score.bars.length}
        prefs={prefs}
        onPlay={play}
        onPrefs={update}
      />
    </main>
  )
}
