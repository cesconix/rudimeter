import type { Exercise, Slot } from './types'

/**
 * `bar`/`beat`/`sub` sono il metronomo: dicono DOVE sei nella battuta. `note`/`note-accent` sono la
 * guida: dicono COSA suonare. Timbri diversi (vedi `audio/click`), perché una guida fatta con lo
 * stesso bip del metronomo renderebbe indistinguibile il movimento dalla nota.
 */
export type MetronomeKind = 'bar' | 'beat' | 'sub'
export type GuideKind = 'note' | 'note-accent'
export type ClickKind = MetronomeKind | GuideKind

/** I due timbri non sono intercambiabili: separarli qui costringe chi schedula a dire quale vuole. */
export const isGuide = (kind: ClickKind): kind is GuideKind => kind === 'note' || kind === 'note-accent'

export interface Click {
  t: number
  kind: ClickKind
  /** gap training: il click esiste nel piano ma non suona */
  silent: boolean
}

export interface MetronomeOptions {
  /** click per movimento: 1 = solo i movimenti, 2/3/4 = anche le suddivisioni */
  clickSubdivision: 1 | 2 | 3 | 4
  /** gap training: `on` battute con click, `off` senza; conta dalla prima battuta dopo il count-in, attraverso le ripetizioni */
  gap?: { on: number; off: number }
  /**
   * Suono di guida: un colpo su ogni nota, più forte sugli accenti. Serve a IMPARARE il pattern —
   * si accende per sentirlo, si spegne per verificarsi. Segue il gap come il click: se continuasse
   * a suonare nelle battute mute, il gap training non esisterebbe più.
   *
   * Da uno speaker questa finisce nel microfono ESATTAMENTE sugli istanti attesi: ogni nota prende
   * un colpo perfetto e la sessione riporta un'esecuzione impeccabile che non è avvenuta. Il click,
   * cadendo sui movimenti, sporca il risultato; questa lo falsifica. Per questo il report si porta
   * dietro che era attiva.
   */
  guide?: boolean
}

export const DEFAULT_METRONOME: MetronomeOptions = { clickSubdivision: 1 }

export interface RepeatPlan {
  repeat: number
  bpm: number
  start: number
  end: number
  slots: Slot[]
  clicks: Click[]
}

export interface Grid {
  t0: number
  countInEnd: number
  end: number
  countInClicks: Click[]
  repeats: RepeatPlan[]
  /** tutti gli slot in ordine; `slots[i].index === i` */
  slots: Slot[]
  /** count-in + ripetizioni, in ordine di tempo */
  clicks: Click[]
  /** durata minima di uno step: soglia per scartare i colpi del count-in */
  minStepDur: number
}

export interface GridOptions {
  countInBars?: number
  metronome?: MetronomeOptions
}

export const beatDuration = (bpm: number): number => 60 / bpm

export const barDuration = (ex: Exercise, bpm: number): number => ex.timeSignature[0] * beatDuration(bpm)

export function isSilentBar(globalBar: number, gap?: { on: number; off: number }): boolean {
  if (!gap || gap.off <= 0 || gap.on <= 0) return false
  return globalBar % (gap.on + gap.off) >= gap.on
}

function beatClicks(beatStart: number, beat: number, k: number, silent: boolean, metro: MetronomeOptions): Click[] {
  const out: Click[] = []
  for (let s = 0; s < metro.clickSubdivision; s++) {
    out.push({
      t: beatStart + (s * beat) / metro.clickSubdivision,
      kind: s > 0 ? 'sub' : k === 0 ? 'bar' : 'beat',
      silent,
    })
  }
  return out
}

/** Click del count-in: `bars` battute, mai silenziose. */
export function buildCountIn(ex: Exercise, bpm: number, t0: number, bars: number, metro: MetronomeOptions): Click[] {
  const [num] = ex.timeSignature
  const beat = beatDuration(bpm)
  const out: Click[] = []
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < num; k++) out.push(...beatClicks(t0 + (b * num + k) * beat, beat, k, false, metro))
  }
  return out
}

/**
 * Una ripetizione: slot (solo step con mano) e click.
 * `indexOffset` = slot già emessi dalle ripetizioni precedenti; `barOffset` = battute già suonate (per il gap).
 */
export function buildRepeat(
  ex: Exercise,
  bpm: number,
  start: number,
  repeat: number,
  indexOffset: number,
  barOffset: number,
  metro: MetronomeOptions,
): RepeatPlan {
  const [num] = ex.timeSignature
  const beat = beatDuration(bpm)
  const slots: Slot[] = []
  const clicks: Click[] = []
  ex.bars.forEach((bar, b) => {
    const barStart = start + b * num * beat
    const silent = isSilentBar(barOffset + b, metro.gap)
    bar.beats.forEach((bt, k) => {
      const beatStart = barStart + k * beat
      clicks.push(...beatClicks(beatStart, beat, k, silent, metro))
      const dur = beat / bt.steps.length
      bt.steps.forEach((step, i) => {
        if (step.hand === null) return
        const t = beatStart + i * dur
        slots.push({ index: indexOffset + slots.length, t, dur, step, repeat, bar: b, beat: k, sub: i })
        // La guida esce dallo stesso giro dello slot: stesso istante per costruzione, senza una
        // seconda passata che potrebbe divergere. Entra nella coda dei click, quindi eredita
        // lookahead, count-in e il taglio-e-ripianifica dell'auto-increment senza aggiungere nulla.
        if (metro.guide) clicks.push({ t, kind: step.accent ? 'note-accent' : 'note', silent })
      })
    })
  })
  return { repeat, bpm, start, end: start + ex.bars.length * num * beat, slots, clicks }
}

function assemble(t0: number, countInEnd: number, countInClicks: Click[], repeats: RepeatPlan[]): Grid {
  const slots = repeats.flatMap((r) => r.slots)
  const clicks = [...countInClicks, ...repeats.flatMap((r) => r.clicks)]
  const minStepDur = slots.reduce((m, s) => Math.min(m, s.dur), Infinity)
  return {
    t0,
    countInEnd,
    end: repeats[repeats.length - 1].end,
    countInClicks,
    repeats,
    slots,
    clicks,
    minStepDur: Number.isFinite(minStepDur) ? minStepDur : 0,
  }
}

export function buildGrid(ex: Exercise, bpm: number, t0: number, opts: GridOptions = {}): Grid {
  const countInBars = opts.countInBars ?? 1
  const metro = opts.metronome ?? DEFAULT_METRONOME
  const countInEnd = t0 + countInBars * barDuration(ex, bpm)
  const repeats: RepeatPlan[] = []
  let start = countInEnd
  let offset = 0
  for (let r = 0; r < ex.repeats; r++) {
    const rp = buildRepeat(ex, bpm, start, r, offset, r * ex.bars.length, metro)
    repeats.push(rp)
    start = rp.end
    offset += rp.slots.length
  }
  return assemble(t0, countInEnd, buildCountIn(ex, bpm, t0, countInBars, metro), repeats)
}

/** Ricostruisce le ripetizioni da `fromRepeat` in poi a un nuovo bpm, dalla fine della precedente. Le precedenti restano identiche. */
export function replanGrid(grid: Grid, ex: Exercise, fromRepeat: number, bpm: number, metro: MetronomeOptions): Grid {
  const kept = grid.repeats.slice(0, fromRepeat)
  let start = kept.length ? kept[kept.length - 1].end : grid.countInEnd
  let offset = kept.reduce((n, r) => n + r.slots.length, 0)
  const rebuilt: RepeatPlan[] = []
  for (let r = fromRepeat; r < grid.repeats.length; r++) {
    const rp = buildRepeat(ex, bpm, start, r, offset, r * ex.bars.length, metro)
    rebuilt.push(rp)
    start = rp.end
    offset += rp.slots.length
  }
  return assemble(grid.t0, grid.countInEnd, grid.countInClicks, [...kept, ...rebuilt])
}

/** Indice dell'ultimo slot con t ≤ now, o -1 prima del primo. */
export function slotIndexAt(grid: Grid, now: number): number {
  const s = grid.slots
  if (s.length === 0 || now < s[0].t) return -1
  let lo = 0
  let hi = s.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (s[mid].t <= now) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Ripetizione in corso a `now`: 0 prima dell'inizio, l'ultima dopo la fine. */
export function repeatAt(grid: Grid, now: number): number {
  const i = grid.repeats.findIndex((r) => now >= r.start && now < r.end)
  if (i >= 0) return i
  return now < grid.countInEnd ? 0 : grid.repeats.length - 1
}
