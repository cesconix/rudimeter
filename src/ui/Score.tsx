import { useEffect, useRef } from 'react'
import type { Grid } from '../engine/grid'
import type { Exercise, Grade, Judged } from '../engine/types'
import { cursorX, type CursorPoint } from '../notation/cursor'
import { paintDiff } from '../notation/paint'
import { planExercise } from '../notation/plan'
import { notationFontsReady, renderScore, type RenderedScore } from '../notation/render'

interface Props {
  exercise: Exercise
  grid: Grid
  judged: Judged[]
  /** clock UDIBILE in secondi (vedi `audibleTime`), non `ctx.currentTime`: il cursore sta col suono che esce */
  now: number
}

/** La nota corrente sta a un terzo dello schermo: si vede cosa arriva. */
const ANCHOR = 1 / 3
const HEIGHT = 140

export function Score({ exercise, grid, judged, now }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const rendered = useRef<RenderedScore | null>(null)
  const lastGrades = useRef(new Map<number, Grade>())
  const points = useRef<{ grid: Grid; score: RenderedScore; points: CursorPoint[] } | null>(null)

  // Un render per esercizio. Le ripetizioni sono srotolate: 20 × 2 battute = 40 battute in un SVG.
  // renderScore non va chiamato prima che i font siano pronti (vedi il suo docstring), quindi questo
  // effect è asincrono. StrictMode monta due volte: senza guardia, il primo invocation potrebbe
  // risolvere DOPO il secondo e sovrascrivere `rendered.current` con oggetti il cui SVG il secondo
  // render ha già cancellato (renderScore fa `host.innerHTML = ''`). `cancelled` impedisce che
  // un'invocazione scavalcata scriva `rendered`/`lastGrades`/`points`: li scrive solo chi ha vinto,
  // e li scrive tutti e tre insieme — `lastGrades` è la memoria di QUESTO SVG (vedi paintDiff).
  // Azzeriamo i tre ref anche PRIMA dell'await, non solo dopo: se questo effect si ri-esegue senza
  // smontaggio (nessun caller lo fa oggi — vedi i commenti di SessionScreen — ma un futuro caller a
  // finestre lo farebbe), i ref altrimenti resterebbero puntati al render precedente per tutta la durata
  // dell'attesa, mentre l'altro effect gira già coi nuovi `grid`/`judged`: colorerebbe il punteggio
  // vecchio coi giudizi nuovi. Azzerarli subito rende quella finestra inerte tramite il già esistente
  // `if (!r) return` sotto, invece di fargli fare la cosa sbagliata.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    rendered.current = null
    lastGrades.current = new Map()
    points.current = null
    notationFontsReady().then(() => {
      if (cancelled) return
      const r = renderScore(host, planExercise(exercise), {
        timeSignature: `${exercise.timeSignature[0]}/${exercise.timeSignature[1]}`,
        beatsPerBar: exercise.timeSignature[0],
        height: HEIGHT,
      })
      rendered.current = r
      lastGrades.current = new Map()
      points.current = null
    })
    return () => {
      cancelled = true
    }
  }, [exercise])

  // Ogni render (SessionScreen ri-renderizza a ogni tick): scorri e colora ciò che è cambiato.
  // Se il render della partitura è ancora in volo (rendered.current === null, vedi sopra) non c'è
  // niente da scorrere o colorare: si riprova al prossimo tick.
  useEffect(() => {
    const r = rendered.current
    const vp = viewportRef.current
    const host = hostRef.current
    const cur = cursorRef.current
    if (!r || !vp || !host || !cur) return
    // Chiave sia su `grid` sia su `r`: le coordinate vengono da `r`, non da `grid`, quindi un futuro
    // caller che ri-renderizzi la partitura per la STESSA grid (di nuovo, le finestre: stessa sessione,
    // stessa grid, un nuovo RenderedScore per finestra) deve invalidare la cache anche se `grid` non
    // cambia — altrimenti il cursore userebbe per sempre le x del render precedente.
    if (points.current?.grid !== grid || points.current?.score !== r) {
      points.current = {
        grid,
        score: r,
        points: grid.slots.flatMap((s) => {
          const n = r.notes.get(s.index)
          return n ? [{ t: s.t, x: n.x }] : []
        }),
      }
    }
    const x = cursorX(points.current.points, now)
    const anchor = vp.clientWidth * ANCHOR
    host.style.transform = `translateX(${anchor - x}px)`
    cur.style.left = `${anchor}px`
    paintDiff(judged, (i) => r.notes.get(i)?.note.getSVGElement(), lastGrades.current)
  })

  return (
    <div className="score-viewport" ref={viewportRef} style={{ height: HEIGHT }}>
      <div className="score-cursor" ref={cursorRef} />
      <div className="score-host" ref={hostRef} />
    </div>
  )
}
