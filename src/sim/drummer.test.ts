import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { parseExercise } from '../engine/exercise'
import { buildGrid, DEFAULT_METRONOME, replanGrid } from '../engine/grid'
import { PLAYER_PRESETS, planStrokes } from './player'

/** What `scheduleStroke` would have played, without Web Audio. */
const played: { t: number; peakDb: number }[] = []

// Copied eagerly: `mock.module` mutates the live namespace object in place (see click-scheduler.test.ts).
const real = { ...(await import('./stroke')) }

mock.module('./stroke', () => ({
  scheduleStroke: (_dest: unknown, time: number, peakDb: number) => {
    played.push({ t: time, peakDb })
  },
}))

const { Drummer } = await import('./drummer')

// Module mocks are process-global: hand the whole real namespace back for whoever loads `./stroke` next.
afterAll(() => {
  mock.module('./stroke', () => ({ ...real }))
})

/** Fake output node: only `context.currentTime`, mutable to simulate time passing. */
function fakeDest(currentTime: number): { dest: AudioNode; set(t: number): void } {
  const context = { currentTime }
  return {
    dest: { context } as unknown as AudioNode,
    set: (t: number) => {
      context.currentTime = t
    },
  }
}

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 4 })
const model = PLAYER_PRESETS.steady
const asPlayed = (s: { t: number; peakDb: number }) => ({ t: s.t, peakDb: s.peakDb })

describe('Drummer', () => {
  beforeEach(() => {
    played.length = 0
  })

  it('plays every stroke of the grid at the planned time and level when the whole grid is within the lookahead', () => {
    const { dest } = fakeDest(0)
    const grid = buildGrid(ex, 120, 0.5)
    const d = new Drummer(dest, model, 1, { lookahead: 100, intervalMs: 1000 })
    d.follow({ grid })
    expect(played).toEqual(planStrokes(grid.slots, model, 1).map(asPlayed))
    expect(played.length).toBe(grid.slots.length)
    d.stop()
  })

  it('ignores the same grid object and never plays a stroke twice', () => {
    const { dest } = fakeDest(0)
    const grid = buildGrid(ex, 120, 0.5)
    const d = new Drummer(dest, model, 1, { lookahead: 100, intervalMs: 1000 })
    d.follow({ grid })
    const n = played.length
    d.follow({ grid })
    expect(played.length).toBe(n)
    d.stop()
  })

  it('on a replanned grid keeps what is inside the committed horizon and plays the rest from the new plan', async () => {
    const { dest, set } = fakeDest(0)
    const grid = buildGrid(ex, 120, 0.5)
    // Count-in of one bar at 120 bpm: the first slot is at 1.5 s, repeats last 1 s each (2/4 at 120).
    const d = new Drummer(dest, model, 1, { lookahead: 1, intervalMs: 5 })
    d.follow({ grid })
    expect(played).toEqual([])
    set(1.2)
    await Bun.sleep(100)
    // The ticks at 1.2 s pull what falls inside the lookahead: t < 2.2.
    const plan = planStrokes(grid.slots, model, 1)
    expect(played).toEqual(plan.filter((s) => s.t < 2.2).map(asPlayed))
    // Repeats 2 and 3 move to 160 bpm; 0 and 1 keep their slots and therefore their strokes.
    // The replan cuts at now + lookahead + intervalMs = 2.205 s: the old plan stays below it, the new one starts there.
    const grid2 = replanGrid(grid, ex, 2, 160, DEFAULT_METRONOME)
    d.follow({ grid: grid2 })
    set(100)
    await Bun.sleep(100)
    const horizon = 1.2 + 1 + 0.005
    const before = plan.filter((s) => s.t < horizon)
    const after = planStrokes(grid2.slots, model, 1).filter((s) => s.t >= horizon)
    expect(played).toEqual([...before, ...after].map(asPlayed))
    expect(new Set(played.map((p) => p.t)).size).toBe(played.length)
    d.stop()
  })
})
