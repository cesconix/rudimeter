import type { Exercise, Slot } from './types'

/**
 * `bar`/`beat`/`sub` are the metronome: they say WHERE you are in the bar. `note`/`note-accent` are
 * the guide: they say WHAT to play. Different timbres (see `audio/click`), because a guide made with
 * the same metronome beep would make the beat indistinguishable from the note.
 */
export type MetronomeKind = 'bar' | 'beat' | 'sub'
export type GuideKind = 'note' | 'note-accent'
export type ClickKind = MetronomeKind | GuideKind

/** The two timbres are not interchangeable: splitting them here forces the scheduler to say which it wants. */
export const isGuide = (kind: ClickKind): kind is GuideKind => kind === 'note' || kind === 'note-accent'

export interface Click {
  t: number
  kind: ClickKind
  /** gap training: the click exists in the plan but does not sound */
  silent: boolean
}

export interface MetronomeOptions {
  /** clicks per beat: 1 = beats only, 2/3/4 = subdivisions too */
  clickSubdivision: 1 | 2 | 3 | 4
  /** gap training: `on` bars with click, `off` without; counts from the first bar after the count-in, across the repeats */
  gap?: { on: number; off: number }
  /**
   * Guide sound: one stroke on every note, louder on the accents. It is there to LEARN the pattern —
   * you turn it on to hear it, you turn it off to check yourself. It follows the gap like the click:
   * if it kept sounding through the muted bars, gap training would no longer exist.
   *
   * From a speaker this ends up in the microphone EXACTLY on the expected instants: every note gets
   * a perfect stroke and the session reports a flawless run that never happened. The click, falling
   * on the beats, dirties the result; this one falsifies it. That is why the report carries along
   * that it was on.
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
  /** all the slots in order; `slots[i].index === i` */
  slots: Slot[]
  /** count-in + repeats, in time order */
  clicks: Click[]
  /** minimum duration of a step: threshold for discarding the count-in hits */
  minStepDur: number
}

export interface GridOptions {
  countInBars?: number
  metronome?: MetronomeOptions
}

const beatDuration = (bpm: number): number => 60 / bpm

const barDuration = (ex: Exercise, bpm: number): number => ex.timeSignature[0] * beatDuration(bpm)

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

/** Count-in clicks: `bars` bars, never silent. */
function buildCountIn(ex: Exercise, bpm: number, t0: number, bars: number, metro: MetronomeOptions): Click[] {
  const [num] = ex.timeSignature
  const beat = beatDuration(bpm)
  const out: Click[] = []
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < num; k++) out.push(...beatClicks(t0 + (b * num + k) * beat, beat, k, false, metro))
  }
  return out
}

/**
 * One repeat: slots (steps with a hand only) and clicks.
 * `indexOffset` = slots already emitted by the previous repeats; `barOffset` = bars already played (for the gap).
 */
function buildRepeat(
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
        // The guide comes out of the same loop as the slot: same instant by construction, with no
        // second pass that could diverge. It enters the click queue, so it inherits lookahead,
        // count-in and the cut-and-replan of the auto-increment without adding anything.
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

/** Rebuilds the repeats from `fromRepeat` on at a new bpm, from the end of the previous one. The previous ones stay identical. */
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

/** Index of the last slot with t ≤ now, or -1 before the first one. */
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

/** Repeat in progress at `now`: 0 before the start, the last one after the end. */
export function repeatAt(grid: Grid, now: number): number {
  const i = grid.repeats.findIndex((r) => now >= r.start && now < r.end)
  if (i >= 0) return i
  return now < grid.countInEnd ? 0 : grid.repeats.length - 1
}
