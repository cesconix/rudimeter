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
  scheduleClick: (_ctx: unknown, time: number) => {
    sounded.push({ t: time })
  },
  scheduleGuide: (_ctx: unknown, time: number) => {
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

/** AudioContext fittizio: solo `currentTime`, mutabile per simulare il passare del tempo. */
function fakeCtx(currentTime: number): { ctx: AudioContext; set(t: number): void } {
  const obj = { currentTime }
  return {
    ctx: obj as unknown as AudioContext,
    set: (t: number) => {
      obj.currentTime = t
    },
  }
}

const click = (t: number, kind: Click['kind'] = 'beat', silent = false): Click => ({ t, kind, silent })

describe('ClickScheduler', () => {
  beforeEach(() => {
    sounded.length = 0
  })

  it('estrae un click silenzioso dalla coda ma non lo suona', () => {
    const { ctx } = fakeCtx(0)
    const s = new ClickScheduler(ctx, { lookahead: 1, intervalMs: 1000 })
    s.add([click(0.1, 'beat', false), click(0.2, 'beat', true)])
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([0.1])
    s.stop()
  })

  it('una battuta muta (run di click silenziosi consecutivi) non produce audio; i click udibili intorno restano al loro orario esatto', () => {
    const { ctx } = fakeCtx(0)
    const s = new ClickScheduler(ctx, { lookahead: 1, intervalMs: 1000 })
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

  it('dropAfter non taglia mai sotto il margine già committato sul clock audio (now + lookahead + intervalMs), e ritorna il taglio effettivo', () => {
    const { ctx, set } = fakeCtx(10)
    const s = new ClickScheduler(ctx, { lookahead: 0.1, intervalMs: 25 })
    s.add([click(10.05), click(10.1), click(10.2), click(20)])
    // margine di sicurezza = 10 + 0.1 + 0.025 = 10.125: il taglio richiesto (10.06) cade sotto,
    // quindi il taglio effettivo si sposta a 10.125 (non 10.06) e 10.1 sopravvive.
    const actual = s.dropAfter(10.06)
    expect(actual).toBeCloseTo(10.125, 6)
    set(1000)
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([10.05, 10.1])
    s.stop()
  })

  it('dropAfter senza clamp (taglio già oltre il margine) ritorna esattamente il taglio richiesto', () => {
    const { ctx, set } = fakeCtx(10)
    const s = new ClickScheduler(ctx, { lookahead: 0.1, intervalMs: 25 })
    s.add([click(10.05), click(10.1), click(15), click(20)])
    // margine di sicurezza = 10.125: il taglio richiesto (15) è già oltre, nessun clamp.
    const actual = s.dropAfter(15)
    expect(actual).toBe(15)
    set(1000)
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([10.05, 10.1])
    s.stop()
  })
})
