import { describe, expect, it } from 'bun:test'
import { parseExercise } from '../engine/exercise'
import type { Click } from '../engine/grid'
import type { Hit } from '../engine/types'
import { type RunnerDeps, SessionRunner } from './runner'

/**
 * `dropAfterReturns` simulates the clamp of the real ClickSink (`ClickScheduler.dropAfter`): by default
 * it returns exactly the requested cut (no clamp), but a test can make it return an effective
 * cut pushed later to verify that the runner discards the clicks added before that point.
 */
function fakeDeps(opts: { dropAfterReturns?: (requested: number) => number } = {}) {
  let t = 100
  let listener: ((h: Hit) => void) | null = null
  const scheduled: { clicks: Click[]; added: Click[][]; droppedAfter: number[]; stopped: boolean }[] = []
  const deps: RunnerDeps = {
    now: () => t,
    scheduleClicks: (clicks) => {
      const entry = { clicks, added: [] as Click[][], droppedAfter: [] as number[], stopped: false }
      scheduled.push(entry)
      return {
        add: (c) => {
          entry.added.push(c)
        },
        dropAfter: (x) => {
          entry.droppedAfter.push(x)
          return opts.dropAfterReturns ? opts.dropAfterReturns(x) : x
        },
        stop: () => {
          entry.stopped = true
        },
      }
    },
    onHit: (l) => {
      listener = l
      return () => {
        listener = null
      }
    },
  }
  return {
    deps,
    scheduled,
    advance: (dt: number) => {
      t += dt
    },
    hit: (h: Hit) => listener?.(h),
    hasListener: () => listener !== null,
  }
}

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 1 })

describe('SessionRunner', () => {
  it('starts in count-in, schedules the clicks with an accent on the first beat and corrects the latency', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 50, slope: null })
    r.start()
    expect(r.snapshot().phase).toBe('count-in')
    expect(f.scheduled[0].clicks).toHaveLength(2 + 4)
    expect(f.scheduled[0].clicks.map((c) => c.kind)).toEqual(['bar', 'beat', 'bar', 'beat', 'bar', 'beat'])
    const firstSlot = r.snapshot().grid.slots[0].t
    f.hit({ t: firstSlot + 0.05 + 0.01, peakDb: -20 })
    expect(r.snapshot().result.judged[0].offsetMs).toBeCloseTo(10)
  })

  it('ignores the hits during the count-in', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    f.hit({ t: r.snapshot().grid.t0 + 0.5, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(0)
  })

  it('compensates the dynamics with the slope', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: 0.5 })
    r.start()
    f.hit({ t: r.snapshot().grid.slots[0].t, peakDb: -10 })
    expect(r.snapshot().hits[0].peakDb).toBeCloseTo(-20)
  })

  it('live: the future slots are pending; at the end of the grid they become miss and the phase is done', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    f.advance(0.5 + 2.1)
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const live = r.tick()!
    expect(live.phase).toBe('playing')
    expect(live.result.judged[7].grade).toBe('pending')
    f.advance(10)
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    expect(r.tick()!.phase).toBe('done')
    expect(r.stats().slots).toBe(8)
    expect(r.stats().miss).toBe(8)
    expect(f.scheduled[0].stopped).toBe(true)
    expect(f.hasListener()).toBe(false)
  })

  it('an early stop closes the session and notifies the subscribers', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    const phases: string[] = []
    r.subscribe((s) => phases.push(s.phase))
    r.start()
    r.stop()
    expect(phases).toEqual(['count-in', 'done'])
    expect(r.tick()).toBeNull()
  })

  it('boundary: a hit exactly at the countInEnd - minStepDur/2 limit is kept', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.minStepDur / 2
    f.hit({ t: boundary, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(1)
    expect(r.snapshot().result.judged[0].grade).not.toBe('miss')
  })

  it('boundary: a hit slightly before the limit is discarded', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.minStepDur / 2
    f.hit({ t: boundary - 0.01, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(0)
  })

  it('boundary: a hit slightly after the limit is kept', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.minStepDur / 2
    f.hit({ t: boundary + 0.01, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(1)
    expect(r.snapshot().result.judged[0].grade).not.toBe('miss')
  })
})

describe('auto-increment', () => {
  const ex6 = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 6 })
  const ai = { step: 10, after: 2, minAccuracy: 0.9, maxBpm: 240 }

  it('after 2 clean repeats it raises by 10 from the repeat following the one in progress and updates the clicks', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots
      .filter((s) => s.repeat < 2)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats.map((x) => x.bpm)).toEqual([60, 60, 60, 70, 70, 70])
    expect(s.grid.repeats[3].start).toBeCloseTo(grid0.repeats[3].start, 6)
    expect(f.scheduled[0].droppedAfter).toEqual([s.grid.repeats[3].start])
    expect(f.scheduled[0].added[0]).toHaveLength(3 * 4)
    expect(s.bpm).toBe(60)
  })

  it('with one miss it does not raise', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots
      .filter((s) => s.repeat < 2 && s.index !== 3)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    expect(r.tick()!.grid.repeats.every((x) => x.bpm === 60)).toBe(true)
    expect(f.scheduled[0].added).toEqual([])
  })

  it('if the ClickSink pushes the cut later (clamp), the clicks added all stay at the effective cut or after', () => {
    // Simulates the clamp of ClickScheduler.dropAfter: the effective cut comes back 2 beats (at the new
    // bpm, 70) after the requested one — as if the audio margin already committed had eaten that stretch.
    const beat = 60 / 70
    const f = fakeDeps({ dropAfterReturns: (requested) => requested + 2 * beat })
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots
      .filter((s) => s.repeat < 2)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    r.tick()
    const requested = f.scheduled[0].droppedAfter[0]
    const actualCut = requested + 2 * beat
    const added = f.scheduled[0].added[0]
    // repeat 3 (the first replanned one) has 4 clicks at offsets [0, beat, 2beat, 3beat] from `requested`:
    // the first two (0 and beat) fall before the effective cut and must be discarded; repeat 4 and
    // 5 stay whole (their clicks start at 4beat, well past the effective cut).
    expect(added.every((c) => c.t >= actualCut)).toBe(true)
    expect(added).toHaveLength(3 * 4 - 2)
  })

  it('without clamp (effective cut = requested) all the replanned clicks are added', () => {
    const f = fakeDeps({ dropAfterReturns: (requested) => requested })
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots
      .filter((s) => s.repeat < 2)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    const requested = f.scheduled[0].droppedAfter[0]
    expect(requested).toBeCloseTo(s.grid.repeats[3].start, 6)
    expect(f.scheduled[0].added[0]).toHaveLength(3 * 4)
    expect(f.scheduled[0].added[0].every((c) => c.t >= requested)).toBe(true)
  })

  it('the repeat in progress at the moment of the raise is not touched by the replan (same instance)', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    const inProgressBefore = grid0.repeats[2]
    grid0.slots
      .filter((s) => s.repeat < 2)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats[2]).toBe(inProgressBefore)
    expect(s.grid.repeats[2].slots.map((sl) => ({ t: sl.t, index: sl.index, dur: sl.dur }))).toEqual(
      inProgressBefore.slots.map((sl) => ({ t: sl.t, index: sl.index, dur: sl.dur })),
    )
  })

  it('several ticks in the same repeat do not raise the bpm more than once', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots
      .filter((s) => s.repeat < 2)
      .forEach((s) => {
        f.advance(s.t - f.deps.now())
        f.hit({ t: s.t, peakDb: -20 })
      })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    r.tick()
    r.tick()
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats.map((x) => x.bpm)).toEqual([60, 60, 60, 70, 70, 70])
    expect(f.scheduled[0].added).toHaveLength(1)
  })
})
