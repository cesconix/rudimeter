import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { Transport } from '../audio/transport'
import { type CursorPoint, cursorAt } from '../notation/cursor'
import { type EngravedRow, engraveRow } from '../notation/engrave'
import { fit, type Prefs } from '../notation/fit'
import { notationFontsReady } from '../notation/fonts'
import { buildLayout, type Layout, NOTEHEAD_PX, STAFF_H, STAFF_TOP, SYSTEM_H } from '../notation/layout'
import {
  cursorPoints,
  type HighlightRect,
  type HighlightSource,
  highlightRects,
  playbackBarAt,
  transportHighlights,
} from '../notation/overlay'
import { deferEnsure, RowPool } from '../notation/rows'
import { resolveInstruments } from '../score/instruments'
import type { Score } from '../score/types'
import type { ViewMode } from './prefs'

interface Props {
  score: Score
  transport: Transport
  /** the AUDIBLE clock of the app's context (`audibleTime`); 0 before the first Play, when the transport holds still anyway */
  now: () => number
  mode: ViewMode
  /** only the two layout preferences: a new object here is a re-layout */
  prefs: Prefs
  /** the written bar the cursor is on, called when it changes */
  onBar: (barIndex: number) => void
}

/** Rotating the iPad emits many resizes in a row, and every measurement costs a whole re-layout. */
const RESIZE_DEBOUNCE_MS = 150
/** Time constant of the scrolling: below it is a jerk, above it the row wrap arrives late. */
const SCROLL_TAU = 0.15
/** Margin above the anchored row, in rows: the row's top band would otherwise sit flush with the edge. */
const ROW_TOP_MARGIN = 0.12
/**
 * Offset beyond which a `scrollTop` is no longer ours but the user's. A pixel and a half covers
 * the browser rounding on fractional values and does not reach any real gesture.
 */
const SCROLL_OWNERSHIP_PX = 1.5
/**
 * How far the cursor band overflows above and below the staff, natural px: the hi-hat and crash
 * heads sit up to 10 px above the top line, the kick's stem ends 30 px below the bottom one. The
 * band crosses the staff instead of stopping at it so it is the NOTE that is marked, not the row;
 * semi-transparent (`.score-cursor`) so the heads stay readable underneath.
 */
const CURSOR_ABOVE = 30
const CURSOR_BELOW = 30
/** Highlight boxes kept in the DOM: one per voice sounding at once — two in the library — with room to spare. */
const HIGHLIGHT_SLOTS = ['h0', 'h1', 'h2', 'h3']

/** Everything the frame loop reads, rebuilt whole on every re-layout: one object, so a frame never mixes two geometries. */
interface Built {
  layout: Layout
  scale: number
  rowH: number
  rowsVisible: number
  pool: RowPool<EngravedRow>
  ensure: (first: number, last: number) => void
  cancel: () => void
  points: CursorPoint[]
  rects: Map<string, HighlightRect>
  highlights: HighlightSource
}

/** The rows a viewport shows in each mode, for the pool. */
function rowWindow(mode: ViewMode, b: Built, scrollTop: number, viewportH: number, row: number): [number, number] {
  const last = b.layout.rows.length - 1
  if (mode === 'pages') {
    const first = Math.floor(row / b.rowsVisible) * b.rowsVisible
    return [first, Math.min(last, first + 2 * b.rowsVisible - 1)]
  }
  return [Math.floor(scrollTop / b.rowH), Math.min(last, Math.floor((scrollTop + viewportH - 1) / b.rowH))]
}

/**
 * The viewport: measures itself, fits and lays the score out, keeps the visible rows engraved
 * through a pool, and runs the one frame loop of the app — cursor, highlights, the viewport's
 * position — writing transforms on elements it holds by ref. Nothing here re-renders React per
 * frame; the two pieces of React state (`size`, `following`) change on a resize and on a gesture.
 */
export function ScoreView({ score, transport, now, mode, prefs, onBar }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const highlightRefs = useRef<(HTMLDivElement | null)[]>([])
  const built = useRef<Built | null>(null)
  // Animation state, not screen state: it changes every frame and no React element depends on it.
  const scrollY = useRef(0)
  // Last `scrollTop` written by us, read back from the DOM. `null` = we do not know it (score just
  // redrawn): while it is null no movement is attributed to the user.
  const expected = useRef<number | null>(null)
  // After a re-layout the position has to be snapped to, not eased into: see the loop.
  const snapNext = useRef(false)
  const followingRef = useRef(true)
  const [following, setFollowing] = useState(true)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const follow = useCallback((on: boolean) => {
    followingRef.current = on
    setFollowing(on)
  }, [])

  // The usable width decides bars per row and scale, the height rows per viewport (see `fit`), so
  // both are measured, never assumed: the frame is a flex child, its size is not the window's.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let pending = 0
    const measure = () =>
      setSize((s) =>
        s.w === frame.clientWidth && s.h === frame.clientHeight ? s : { w: frame.clientWidth, h: frame.clientHeight },
      )
    const ro = new ResizeObserver(() => {
      clearTimeout(pending)
      pending = window.setTimeout(measure, RESIZE_DEBOUNCE_MS)
    })
    ro.observe(frame)
    // First measurement right away: going through the debounce would leave the score empty for 150 ms at startup.
    measure()
    return () => {
      clearTimeout(pending)
      ro.disconnect()
    }
  }, [])

  // One layout per piece, size, mode and layout preference. Asynchronous because nothing engraves
  // before the fonts are ready; `cancelled` keeps an overtaken run (StrictMode mounts twice, a
  // resize lands during the wait) from writing `built` over the one that won. The refs are cleared
  // BEFORE the await: the loop keeps running meanwhile and must find nothing rather than the old geometry.
  useEffect(() => {
    const host = hostRef.current
    const vp = viewportRef.current
    const cur = cursorRef.current
    if (!host || !vp || !cur || size.w === 0 || size.h === 0) return
    let cancelled = false
    built.current = null
    notationFontsReady()
      .then(() => {
        if (cancelled) return
        const f = fit(size.w, size.h, prefs, score)
        const layout = buildLayout(score, { barsPerRow: f.barsPerRow, auto: prefs.barsPerRow === 'auto' })
        const catalogue = resolveInstruments(score)
        const rowH = SYSTEM_H * f.scale
        host.replaceChildren()
        host.style.height = `${layout.rows.length * rowH}px`
        // Pages: whole rows, or the page would turn with a sliver of the next one showing. Scroll: the frame's height.
        vp.style.height = mode === 'pages' ? `${f.rowsVisible * rowH}px` : ''
        cur.style.width = `${NOTEHEAD_PX * f.scale}px`
        cur.style.height = `${(STAFF_H + CURSOR_ABOVE + CURSOR_BELOW) * f.scale}px`
        const pool = new RowPool(layout.rows.length, (r) =>
          engraveRow(host, score, catalogue, layout, layout.rows[r], f.scale),
        )
        const deferred = deferEnsure(pool)
        const b: Built = {
          layout,
          scale: f.scale,
          rowH,
          rowsVisible: f.rowsVisible,
          pool,
          ensure: deferred.ensure,
          cancel: deferred.cancel,
          points: cursorPoints(layout, score, transport.playback),
          rects: highlightRects(score, catalogue, layout, transport.playback),
          highlights: transportHighlights(transport.events),
        }
        // The rows around the cursor now, synchronously: a frame with an empty viewport is a flash.
        const pos = transport.positionAt(now())
        const row = layout.rowOfBar[transport.playback[playbackBarAt(transport.starts, pos)].barIndex]
        const top = mode === 'pages' ? Math.floor(row / f.rowsVisible) * f.rowsVisible * rowH : row * rowH
        pool.ensure(...rowWindow(mode, b, top, vp.clientHeight || f.rowsVisible * rowH, row))
        built.current = b
        // Redrawing changes the geometry under our feet and the browser re-clamps `scrollTop` on
        // its own: that movement is not the user's and must not suspend the following.
        expected.current = null
        snapNext.current = true
      })
      // Without this an error inside the engraver leaves `built` at null for the rest of the
      // session — no score, no cursor — in perfect silence.
      .catch((err) => console.error('score layout failed', err))
    return () => {
      cancelled = true
      built.current?.cancel()
      built.current?.pool.invalidate()
      built.current = null
    }
  }, [score, transport, size, mode, prefs, now])

  // The frame loop. `dt` for the damping comes from the rAF timestamp: it is a visual constant,
  // not music timing, and the audio clock does not exist before the first Play, when a tap on a
  // bar must still scroll the view to it.
  useEffect(() => {
    let raf = 0
    let lastTs = 0
    let lastBar = -1
    const step = (ts: number) => {
      raf = requestAnimationFrame(step)
      const dt = lastTs === 0 ? 0 : Math.min(0.1, (ts - lastTs) / 1000)
      lastTs = ts
      const b = built.current
      const vp = viewportRef.current
      const host = hostRef.current
      const cur = cursorRef.current
      if (!b || !vp || !host || !cur) return
      const t = now()
      transport.tick(t)
      const pos = transport.positionAt(t)
      const { scale, rowH } = b

      // The cursor: x inside the row, the row's top plus the band's offset. `rowEndX` is 0 and
      // unused: the points carry a bar-end point, so no interval of `cursorAt` crosses rows.
      const p = cursorAt(b.points, pos, 0)
      cur.style.transform = `translate(${p.x * scale}px, ${p.row * rowH + (STAFF_TOP - CURSOR_ABOVE) * scale}px)`

      // The highlights: one box per sounding event, moved only when its key changes.
      const keys = b.highlights(pos)
      highlightRefs.current.forEach((el, i) => {
        if (!el) return
        const key = keys[i]
        const r = key === undefined ? undefined : b.rects.get(key)
        if (!r || key === undefined) {
          if (el.dataset.key) {
            el.dataset.key = ''
            el.hidden = true
          }
          return
        }
        if (el.dataset.key === key) return
        el.dataset.key = key
        el.hidden = false
        el.style.transform = `translate(${r.x * scale}px, ${r.row * rowH + r.y * scale}px)`
        el.style.width = `${r.width * scale}px`
        el.style.height = `${r.height * scale}px`
      })

      // The bar for the transport bar, only when it changes: a React update per bar, never per frame.
      const barIndex = transport.playback[playbackBarAt(transport.starts, pos)].barIndex
      if (barIndex !== lastBar) {
        lastBar = barIndex
        onBar(barIndex)
      }

      // The viewport. Pages: the page the cursor's row is on, turned at once. Scroll: the current
      // row anchors at the top with exponential damping, unless the user took the scrolling over.
      if (mode === 'pages') {
        const first = Math.floor(p.row / b.rowsVisible) * b.rowsVisible
        vp.scrollTop = first * rowH
      } else {
        const maxScroll = Math.max(0, host.offsetHeight - vp.clientHeight)
        const target = Math.max(0, Math.min(maxScroll, p.row * rowH - rowH * ROW_TOP_MARGIN))
        if (followingRef.current) {
          // After a re-layout there is no continuity to preserve: `scrollY` is in pixels of a
          // geometry that no longer exists, so we jump to the target instead of decaying through
          // positions that mean nothing. Otherwise exponential damping, independent of the frame rate.
          scrollY.current = snapNext.current
            ? target
            : scrollY.current + (target - scrollY.current) * (1 - Math.exp(-dt / SCROLL_TAU))
          vp.scrollTop = scrollY.current
          // Read back from the DOM, not the value written: the browser rounds and clamps, and the
          // difference would look like a user gesture to the detector below.
          expected.current = vp.scrollTop
        } else {
          scrollY.current = vp.scrollTop
          expected.current = vp.scrollTop
        }
        snapNext.current = false
      }
      // The rows the viewport now shows, asked for off the frame step (`deferEnsure`).
      b.ensure(...rowWindow(mode, b, vp.scrollTop, vp.clientHeight, p.row))
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [transport, mode, now, onBar])

  // Who is in charge of the scrolling (scroll mode; in pages mode the viewport does not scroll by
  // hand). The gestures are not listed — the list would always be incomplete — we look at the
  // result: if `scrollTop` is not what we wrote there, someone else moved it. `wheel` stays as an
  // immediate signal of intent. `pointerdown`/`touchstart` no: a finger resting on the iPad, with
  // the sticks in your hands, happens all the time and is not a request to stop the score.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const release = () => follow(false)
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
  }, [follow])

  // A tap on a bar seeks the transport to it (first pass) and hands the scrolling back to the cursor.
  // `click`, not `pointerdown`: a pan on iOS never produces a click, a tap does.
  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    const b = built.current
    const vp = viewportRef.current
    if (!b || !vp) return
    const rect = vp.getBoundingClientRect()
    const x = (e.clientX - rect.left) / b.scale
    const y = e.clientY - rect.top + vp.scrollTop
    const row = b.layout.rows[Math.floor(y / b.rowH)]
    const bar = row?.bars.find((bar) => x >= bar.x - bar.head && x < bar.x + bar.width)
    if (!bar) return
    transport.seek(bar.barIndex)
    follow(true)
  }

  return (
    // The frame is what gets measured and the positioned container of the button; the viewport
    // inside it scrolls (or, in pages mode, is exactly `rowsVisible` rows tall and does not).
    <div className={mode === 'pages' ? 'score-frame score-frame--pages' : 'score-frame'} ref={frameRef}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a tap on the music is a pointer gesture; the transport bar carries the keyboard-reachable controls */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a tap on the music is a pointer gesture; the transport bar carries the keyboard-reachable controls */}
      <div className="score-viewport" ref={viewportRef} onClick={onTap}>
        {/* siblings of the host, not children: a re-layout empties the host */}
        <div className="score-cursor" ref={cursorRef} />
        {HIGHLIGHT_SLOTS.map((id, i) => (
          <div
            key={id}
            className="score-highlight"
            hidden
            ref={(el) => {
              highlightRefs.current[i] = el
            }}
          />
        ))}
        <div className="score-host" ref={hostRef} />
      </div>
      {/* The button is there as long as the user is in charge: if it only showed up with the cursor
          off screen, whoever scrolls a little would stay in manual with no way back to following. */}
      {mode === 'scroll' && !following && (
        <button type="button" className="score-follow" onClick={() => follow(true)}>
          ↓ Back to the cursor
        </button>
      )}
    </div>
  )
}
