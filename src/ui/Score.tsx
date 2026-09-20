import { useEffect, useRef, useState } from 'react'
import type { Grid } from '../engine/grid'
import type { Exercise, Grade, Judged } from '../engine/types'
import { type CursorPoint, cursorAt } from '../notation/cursor'
import { notationFontsReady } from '../notation/fonts'
import { paintDiff } from '../notation/paint'
import { planExercise } from '../notation/plan'
import {
  NATURAL_NOTEHEAD_PX,
  NATURAL_STAFF_H,
  NATURAL_STAFF_TOP,
  type RenderedScore,
  renderScore,
} from '../notation/render'

interface Props {
  exercise: Exercise
  grid: Grid
  judged: Judged[]
  /** AUDIBLE clock in seconds (see `audibleTime`), not `ctx.currentTime`: the cursor stays with the sound going out */
  now: number
}

/** Rotating the phone emits many resizes in a row, and every measurement costs a whole re-layout. */
const RESIZE_DEBOUNCE_MS = 150
/** Time constant of the scrolling: below it is a jerk, above it the row wrap arrives late. */
const SCROLL_TAU = 0.15
/** Margin above the anchored row: the R/L sticking sits at the top of the band and gets clipped flush. */
const ROW_TOP_MARGIN = 0.12
/**
 * Offset beyond which a `scrollTop` is no longer ours but the user's. A pixel and a half covers
 * the browser rounding on fractional values and does not reach any real gesture.
 */
const SCROLL_OWNERSHIP_PX = 1.5
/**
 * How far the cursor band overflows above and below the staff, in natural px. Above there are stems,
 * beams and accents; below the R/L sticking: the band crosses both instead of stopping at the
 * staff, so it is the NOTE that gets highlighted, not the staff row. That is why it is
 * semi-transparent (see `.score-cursor`): the R or the L must stay readable underneath.
 */
const CURSOR_ABOVE = 26
const CURSOR_BELOW = 22

export function Score({ exercise, grid, judged, now }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const rendered = useRef<RenderedScore | null>(null)
  const lastGrades = useRef(new Map<number, Grade>())
  const points = useRef<{ grid: Grid; score: RenderedScore; points: CursorPoint[] } | null>(null)
  // Animation state, not screen state: it changes every frame and no React element depends on it.
  const scrollY = useRef(0)
  const lastNow = useRef(now)
  // Last `scrollTop` written by us, read back from the DOM. `null` = we do not know it (score just
  // redrawn): while it is null no movement is attributed to the user.
  const expected = useRef<number | null>(null)
  // After a re-layout the position has to be snapped to, not eased into: see below.
  const snapNext = useRef(false)
  const [availW, setAvailW] = useState(0)
  const [following, setFollowing] = useState(true)

  // The usable width decides bars per row and scale (see fitLayout), so it has to be measured, not
  // assumed: the viewport is a flex child, its width is not the window's.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    let pending = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(pending)
      pending = window.setTimeout(() => setAvailW(vp.clientWidth), RESIZE_DEBOUNCE_MS)
    })
    ro.observe(vp)
    // First measurement right away: going through the debounce would leave the score empty for 150ms at startup.
    setAvailW(vp.clientWidth)
    return () => {
      clearTimeout(pending)
      ro.disconnect()
    }
  }, [])

  // One render per exercise and per width. The repeats are unrolled: 20 × 2 bars = 40 bars in one
  // SVG, which wraps rows on its own.
  // renderScore must not be called before the fonts are ready (see its docstring), so this effect
  // is asynchronous. StrictMode mounts twice: without a guard, the first invocation could resolve
  // AFTER the second and overwrite `rendered.current` with objects whose SVG the second render has
  // already deleted (renderScore does `host.innerHTML = ''`). `cancelled` keeps an overtaken
  // invocation from writing `rendered`/`lastGrades`/`points`: only the one that won writes them,
  // and it writes all three together — `lastGrades` is the memory of THIS SVG (see paintDiff).
  // We clear the three refs BEFORE the await too: this effect really does re-run without unmounting,
  // on every width change, and otherwise the refs would stay pointed at the previous render for
  // the whole wait while the other effect is already running with the new `grid`/`judged`: it would
  // colour the old score with the new grades. Clearing them right away makes that window inert
  // through the already existing `if (!r) return` below, instead of letting it do the wrong thing.
  // A fresh `lastGrades` on a fresh SVG is not a loss: on the first tick paintDiff repaints by
  // itself everything already judged, because no grade matches any more.
  useEffect(() => {
    const host = hostRef.current
    if (!host || availW === 0) return
    let cancelled = false
    rendered.current = null
    lastGrades.current = new Map()
    points.current = null
    expected.current = null
    notationFontsReady()
      .then(() => {
        if (cancelled) return
        const bars = planExercise(exercise)
        // The row locks onto the repeat, not onto the bar: a 2-bar pattern on rows of 3 would fall
        // astride them on every pass.
        const barsPerRepeat = Math.max(1, bars.filter((b) => b.repeat === 0).length)
        const r = renderScore(host, bars, {
          timeSignature: `${exercise.timeSignature[0]}/${exercise.timeSignature[1]}`,
          beatsPerBar: exercise.timeSignature[0],
          barsPerRepeat,
          totalBars: bars.length,
          availW,
        })
        rendered.current = r
        lastGrades.current = new Map()
        points.current = null
        // Redrawing changes the geometry under our feet and the browser re-clamps `scrollTop` on
        // its own: that movement is not the user's and must not suspend the following.
        expected.current = null
        snapNext.current = true
      })
      // Without this, an error inside renderScore leaves `rendered` at null for the whole rest of
      // the session — no score, no cursor, no colours — in perfect silence. And now that the refs
      // are cleared before the await, an error during a re-layout also takes away a score that was
      // working.
      .catch((err) => console.error('score render failed', err))
    return () => {
      cancelled = true
    }
  }, [exercise, availW])

  // Every render (SessionScreen re-renders on every tick): scroll, move the cursor and colour what
  // has changed. If the score render is still in flight (rendered.current === null, see above)
  // there is nothing to do: we try again on the next tick.
  useEffect(() => {
    // dt is updated BEFORE any early return: if it fell behind during the font wait (Bravura is a
    // webfont, hundreds of ms from cold) or during a re-layout, the first usable frame would arrive
    // with dt saturated at 0.1s — the page would cover half the distance in one go instead of
    // gliding.
    const dt = Math.min(0.1, Math.max(0, now - lastNow.current))
    lastNow.current = now

    const r = rendered.current
    const vp = viewportRef.current
    const host = hostRef.current
    const cur = cursorRef.current
    if (!r || !vp || !host || !cur) return
    // Keyed on `grid` and on `r` alike: the coordinates come from `r`, not from `grid`, and a
    // re-layout (rotation, width change) produces a new RenderedScore for the same grid — without
    // the second key the cursor would use the x of the previous render forever.
    if (points.current?.grid !== grid || points.current?.score !== r) {
      points.current = {
        grid,
        score: r,
        points: grid.slots.flatMap((s) => {
          const n = r.notes.get(s.index)
          return n ? [{ t: s.t, x: n.x, row: n.row }] : []
        }),
      }
    }

    const { fit } = r
    // The band is as wide as the notehead and starts from its very x (`RenderedNote.x` is the left
    // edge of the notehead): at rest — before the start, and on the last note at the end — it
    // covers exactly the note it sits on, instead of being a line leaning against its side.
    const headW = NATURAL_NOTEHEAD_PX * fit.scale
    // End of the time grid, not edge of the SVG: the row wrap falls on the time axis like every
    // other note, so the cursor crosses it without changing pace.
    const p = cursorAt(points.current.points, now, r.rowEndX)
    // The cursor stays on its row, always; it is the SCROLLING that follows it: the current row
    // anchors at the top and stays there, so the page is still for the whole row and jumps
    // (smoothly) once only at the row wrap. At the end of the piece the clamp to maxScroll stops
    // the page and the cursor goes down on its own to the last row: no special case, it falls out
    // of the min().
    const maxScroll = Math.max(0, host.offsetHeight - vp.clientHeight)
    const target = Math.max(0, Math.min(maxScroll, p.row * fit.systemH - fit.systemH * ROW_TOP_MARGIN))
    if (following) {
      // After a re-layout there is no continuity to preserve: `scrollY` is in pixels of a geometry
      // that no longer exists (rotation: row height and number of rows change together), so we jump
      // to the target instead of decaying for half a second through positions that mean nothing.
      // On the other frames exponential damping, independent of the frame rate: it reaches the
      // target without jerks at the row change and without chasing every micro-variation.
      scrollY.current = snapNext.current
        ? target
        : scrollY.current + (target - scrollY.current) * (1 - Math.exp(-dt / SCROLL_TAU))
      vp.scrollTop = scrollY.current
      // Read back from the DOM, not the value written: the browser rounds and clamps, and the
      // difference would look like a user gesture to the detector below.
      expected.current = vp.scrollTop
    } else {
      // The user is in charge: we read their position instead of writing it, so when it resumes the
      // following restarts from where it was left and not from where it used to be.
      scrollY.current = vp.scrollTop
      expected.current = vp.scrollTop
    }
    snapNext.current = false

    // All three measurements scale with the score: on a narrow screen the band narrows with the
    // note, otherwise on small notes it would cover the one next to it.
    cur.style.transform = `translateX(${p.x}px)`
    cur.style.width = `${headW}px`
    cur.style.top = `${p.row * fit.systemH + (NATURAL_STAFF_TOP - CURSOR_ABOVE) * fit.scale}px`
    cur.style.height = `${(NATURAL_STAFF_H + CURSOR_ABOVE + CURSOR_BELOW) * fit.scale}px`

    paintDiff(judged, (i) => r.notes.get(i)?.note.getSVGElement(), lastGrades.current)
  })

  // Who is in charge of the scrolling. The gestures are not listed — the list would always be
  // incomplete: keyboard (scrolling containers take focus), dragging the scrollbar (which on Blink
  // does not even emit a `pointerdown`), find-in-page, assistive technologies. We look at the
  // result instead: if `scrollTop` is not what we wrote there, someone else moved it. `wheel` stays
  // as an immediate signal of intent, before the page even moves.
  // `pointerdown`/`touchstart` no: a finger resting on the iPad — with the sticks in your hands it
  // happens all the time — is not a request to stop the score. A finger that DRAGS moves
  // `scrollTop`, and the detector below catches it.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const release = () => setFollowing(false)
    const onScroll = () => {
      const e = expected.current
      if (e !== null && Math.abs(vp.scrollTop - e) > SCROLL_OWNERSHIP_PX) release()
    }
    vp.addEventListener('wheel', release, { passive: true })
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      vp.removeEventListener('wheel', release)
      vp.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    // The frame is exactly as big as the viewport and it is the positioned container of the button:
    // anchored higher up (to `main`) the button would float below the score, above the meter.
    <div className="score-frame">
      <div className="score-viewport" ref={viewportRef}>
        {/* sibling of host, not child: renderScore does `host.innerHTML = ''` on every re-layout */}
        <div className="score-cursor" ref={cursorRef} />
        <div className="score-host" ref={hostRef} />
      </div>
      {/* The button is there as long as the user is in charge: if it only showed up with the cursor
          off screen, whoever scrolls a little would stay in manual with no way back to following. */}
      {!following && (
        <button type="button" className="score-follow" onClick={() => setFollowing(true)}>
          ↓ Back to the cursor
        </button>
      )}
    </div>
  )
}
