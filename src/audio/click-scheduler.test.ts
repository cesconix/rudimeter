import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Click } from '../engine/grid'

/** Captures what `scheduleClick`/`scheduleGuide` would have played, without touching real Web Audio. */
const sounded: { t: number }[] = []

// Copied eagerly: `mock.module` mutates the live namespace object in place, so reading these back
// after the mock is installed would hand out the stubs instead of the real functions.
const real = { ...(await import('./click')) }

// `mock.module` must run before the module under test is loaded, hence the dynamic import below:
// a static `import { ClickScheduler }` would be hoisted above the mock.
mock.module('./click', () => ({
  scheduleClick: (_dest: unknown, time: number) => {
    sounded.push({ t: time })
  },
  scheduleGuide: (_dest: unknown, time: number) => {
    sounded.push({ t: time })
  },
  clickOptionsFor: () => ({}),
}))

const { ClickScheduler } = await import('./click-scheduler')

// Module mocks are process-global and outlive this file, so `click.test.ts` gets the stub whenever the
// directory walk reaches it second. `mock.restore()` does not undo module mocks, and re-mocking with a
// live namespace object does not restore either: only a plain object of the real exports does.
afterAll(() => {
  mock.module('./click', () => ({
    clickOptionsFor: real.clickOptionsFor,
    scheduleClick: real.scheduleClick,
    scheduleGuide: real.scheduleGuide,
  }))
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

const click = (t: number, kind: Click['kind'] = 'beat', silent = false): Click => ({ t, kind, silent })

describe('ClickScheduler', () => {
  beforeEach(() => {
    sounded.length = 0
  })

  it('pulls a silent click out of the queue but does not play it', () => {
    const { dest } = fakeDest(0)
    const s = new ClickScheduler(dest, { lookahead: 1, intervalMs: 1000 })
    s.add([click(0.1, 'beat', false), click(0.2, 'beat', true)])
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([0.1])
    s.stop()
  })

  it('a muted bar (a run of consecutive silent clicks) produces no audio; the audible clicks around it stay at their exact time', () => {
    const { dest } = fakeDest(0)
    const s = new ClickScheduler(dest, { lookahead: 1, intervalMs: 1000 })
    s.add([
      click(0.1, 'bar', false),
      click(0.2, 'beat', true),
      click(0.3, 'sub', true),
      click(0.4, 'beat', true),
      click(0.5, 'bar', false),
    ])
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([0.1, 0.5])
    s.stop()
  })

  it('dropAfter never cuts below the margin already committed on the audio clock (now + lookahead + intervalMs), and returns the effective cut', () => {
    const { dest, set } = fakeDest(10)
    const s = new ClickScheduler(dest, { lookahead: 0.1, intervalMs: 25 })
    s.add([click(10.05), click(10.1), click(10.2), click(20)])
    // safety margin = 10 + 0.1 + 0.025 = 10.125: the requested cut (10.06) falls below it,
    // so the effective cut moves to 10.125 (not 10.06) and 10.1 survives.
    const actual = s.dropAfter(10.06)
    expect(actual).toBeCloseTo(10.125, 6)
    set(1000)
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([10.05, 10.1])
    s.stop()
  })

  it('dropAfter without clamp (cut already past the margin) returns exactly the requested cut', () => {
    const { dest, set } = fakeDest(10)
    const s = new ClickScheduler(dest, { lookahead: 0.1, intervalMs: 25 })
    s.add([click(10.05), click(10.1), click(15), click(20)])
    // safety margin = 10.125: the requested cut (15) is already past it, no clamp.
    const actual = s.dropAfter(15)
    expect(actual).toBe(15)
    set(1000)
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([10.05, 10.1])
    s.stop()
  })
})
