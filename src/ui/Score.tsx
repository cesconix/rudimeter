import { useEffect, useRef, useState } from 'react'
import type { Grid } from '../engine/grid'
import type { Exercise, Grade, Judged } from '../engine/types'
import { cursorAt, type CursorPoint } from '../notation/cursor'
import { paintDiff } from '../notation/paint'
import { planExercise } from '../notation/plan'
import { NATURAL_STAFF_H, NATURAL_STAFF_TOP, notationFontsReady, renderScore, type RenderedScore } from '../notation/render'

interface Props {
  exercise: Exercise
  grid: Grid
  judged: Judged[]
  /** clock UDIBILE in secondi (vedi `audibleTime`), non `ctx.currentTime`: il cursore sta col suono che esce */
  now: number
}

/** La rotazione del telefono emette molti resize di fila, e ogni misura costa un re-layout intero. */
const RESIZE_DEBOUNCE_MS = 150
/** Costante di tempo dello scorrimento: sotto è uno scatto, sopra il capo riga arriva in ritardo. */
const SCROLL_TAU = 0.15
/** Margine sopra la riga ancorata: le diteggiature R/L stanno in cima alla banda e a filo si tagliano. */
const ROW_TOP_MARGIN = 0.12

export function Score({ exercise, grid, judged, now }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const rendered = useRef<RenderedScore | null>(null)
  const lastGrades = useRef(new Map<number, Grade>())
  const points = useRef<{ grid: Grid; score: RenderedScore; points: CursorPoint[] } | null>(null)
  // Stato dell'animazione, non dello schermo: cambia a ogni frame e nessun elemento React ne dipende.
  const scrollY = useRef(0)
  const lastNow = useRef(now)
  const [availW, setAvailW] = useState(0)
  const [following, setFollowing] = useState(true)

  // La larghezza utile decide battute per riga e scala (vedi fitLayout), quindi va misurata, non
  // assunta: il viewport è un flex child, la sua larghezza non è quella della finestra.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    let pending = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(pending)
      pending = window.setTimeout(() => setAvailW(vp.clientWidth), RESIZE_DEBOUNCE_MS)
    })
    ro.observe(vp)
    // Prima misura subito: passare dal debounce lascerebbe la partitura vuota per 150ms all'avvio.
    setAvailW(vp.clientWidth)
    return () => {
      clearTimeout(pending)
      ro.disconnect()
    }
  }, [])

  // Un render per esercizio e per larghezza. Le ripetizioni sono srotolate: 20 × 2 battute = 40
  // battute in un SVG, che va a capo da solo.
  // renderScore non va chiamato prima che i font siano pronti (vedi il suo docstring), quindi questo
  // effect è asincrono. StrictMode monta due volte: senza guardia, il primo invocation potrebbe
  // risolvere DOPO il secondo e sovrascrivere `rendered.current` con oggetti il cui SVG il secondo
  // render ha già cancellato (renderScore fa `host.innerHTML = ''`). `cancelled` impedisce che
  // un'invocazione scavalcata scriva `rendered`/`lastGrades`/`points`: li scrive solo chi ha vinto,
  // e li scrive tutti e tre insieme — `lastGrades` è la memoria di QUESTO SVG (vedi paintDiff).
  // Azzeriamo i tre ref anche PRIMA dell'await: ora questo effect si ri-esegue davvero senza
  // smontaggio, a ogni cambio di larghezza, e i ref altrimenti resterebbero puntati al render
  // precedente per tutta l'attesa mentre l'altro effect gira già coi nuovi `grid`/`judged`:
  // colorerebbe il punteggio vecchio coi giudizi nuovi. Azzerarli subito rende quella finestra
  // inerte tramite il già esistente `if (!r) return` sotto, invece di fargli fare la cosa sbagliata.
  // La `lastGrades` nuova su un SVG nuovo non è una perdita: al primo tick paintDiff ridipinge da
  // sé tutto il già giudicato, perché nessun grade combacia più.
  useEffect(() => {
    const host = hostRef.current
    if (!host || availW === 0) return
    let cancelled = false
    rendered.current = null
    lastGrades.current = new Map()
    points.current = null
    notationFontsReady().then(() => {
      if (cancelled) return
      const bars = planExercise(exercise)
      // La riga si aggancia alla ripetizione, non alla battuta: un pattern di 2 battute su righe da
      // 3 cadrebbe a cavallo a ogni giro.
      const barsPerRepeat = Math.max(1, bars.filter((b) => b.repeat === 0).length)
      const r = renderScore(host, bars, {
        timeSignature: `${exercise.timeSignature[0]}/${exercise.timeSignature[1]}`,
        beatsPerBar: exercise.timeSignature[0],
        barsPerRepeat,
        availW,
      })
      rendered.current = r
      lastGrades.current = new Map()
      points.current = null
    })
    return () => {
      cancelled = true
    }
  }, [exercise, availW])

  // Ogni render (SessionScreen ri-renderizza a ogni tick): scorri, muovi il cursore e colora ciò che
  // è cambiato. Se il render della partitura è ancora in volo (rendered.current === null, vedi sopra)
  // non c'è niente da fare: si riprova al prossimo tick.
  useEffect(() => {
    const r = rendered.current
    const vp = viewportRef.current
    const host = hostRef.current
    const cur = cursorRef.current
    if (!r || !vp || !host || !cur) return
    // Chiave sia su `grid` sia su `r`: le coordinate vengono da `r`, non da `grid`, e un re-layout
    // (rotazione, cambio di larghezza) produce un RenderedScore nuovo a parità di grid — senza la
    // seconda chiave il cursore userebbe per sempre le x del render precedente.
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
    // dt dal clock udibile, che è monotòno: un salto (ripresa da background, resync) non deve
    // diventare uno scatto di scorrimento.
    const dt = Math.min(0.1, Math.max(0, now - lastNow.current))
    lastNow.current = now

    const p = cursorAt(points.current.points, now)
    const { fit } = r
    // Il cursore sta sulla sua riga, sempre; è lo SCORRIMENTO che lo insegue: la riga corrente si
    // ancora in cima e ci resta, così la pagina è ferma per tutta la riga e scatta (fluida) una
    // volta sola al capo riga. In fondo al pezzo il clamp a maxScroll ferma la pagina e il cursore
    // scende da solo fino all'ultima riga: nessun caso speciale, cade fuori dal min().
    const maxScroll = Math.max(0, host.offsetHeight - vp.clientHeight)
    const target = Math.max(0, Math.min(maxScroll, p.row * fit.systemH - fit.systemH * ROW_TOP_MARGIN))
    if (following) {
      // Smorzamento esponenziale, indipendente dal frame rate: raggiunge il bersaglio senza scatti
      // al cambio riga e senza rincorrere ogni micro-variazione.
      scrollY.current += (target - scrollY.current) * (1 - Math.exp(-dt / SCROLL_TAU))
      vp.scrollTop = scrollY.current
    } else {
      // Comanda l'utente: si legge la sua posizione invece di scriverla, così alla ripresa
      // l'inseguimento riparte da dove è rimasto e non da dove era.
      scrollY.current = vp.scrollTop
    }

    // Il cursore copre il rigo e poco più, non tutta la banda della riga: deve leggersi come una
    // stanghetta che scorre, non come una barra che invade lo spazio delle diteggiature.
    cur.style.transform = `translateX(${p.x}px)`
    cur.style.top = `${p.row * fit.systemH + (NATURAL_STAFF_TOP - 8) * fit.scale}px`
    cur.style.height = `${(NATURAL_STAFF_H + 16) * fit.scale}px`

    paintDiff(judged, (i) => r.notes.get(i)?.note.getSVGElement(), lastGrades.current)
  })

  // Qualsiasi gesto di scorrimento sospende l'inseguimento: da lì comanda l'utente. Listener sul
  // nodo e non in JSX perché `wheel` e `touchstart` devono essere passivi: non annulliamo niente,
  // e un listener non passivo su un contenitore che scorre costa scatti su mobile.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const release = () => setFollowing(false)
    vp.addEventListener('wheel', release, { passive: true })
    vp.addEventListener('touchstart', release, { passive: true })
    vp.addEventListener('pointerdown', release)
    return () => {
      vp.removeEventListener('wheel', release)
      vp.removeEventListener('touchstart', release)
      vp.removeEventListener('pointerdown', release)
    }
  }, [])

  return (
    <>
      <div className="score-viewport" ref={viewportRef}>
        {/* fratello di host, non figlio: renderScore fa `host.innerHTML = ''` a ogni re-layout */}
        <div className="score-cursor" ref={cursorRef} />
        <div className="score-host" ref={hostRef} />
      </div>
      {/* Il tasto c'è finché comanda l'utente: se comparisse solo a cursore fuori schermo, chi
          scorre di poco resterebbe in manuale senza il modo di tornare a seguire. */}
      {!following && (
        <button className="score-follow" onClick={() => setFollowing(true)}>
          ↓ Torna al cursore
        </button>
      )}
    </>
  )
}
