import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Click } from '../engine/grid'
import { ClickScheduler } from './click-scheduler'

/** Cattura ciò che `scheduleClick` avrebbe suonato, senza toccare il Web Audio reale. */
const sounded = vi.hoisted(() => [] as { t: number }[])

vi.mock('./click', () => ({
  scheduleClick: (_ctx: unknown, time: number) => {
    sounded.push({ t: time })
  },
  clickOptionsFor: () => ({}),
}))

/** AudioContext fittizio: solo `currentTime`, mutabile per simulare il passare del tempo. */
function fakeCtx(currentTime: number): { ctx: AudioContext; set(t: number): void } {
  const obj = { currentTime }
  return { ctx: obj as unknown as AudioContext, set: (t: number) => { obj.currentTime = t } }
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

  it('dropAfter non taglia mai sotto il margine già committato sul clock audio (now + lookahead + intervalMs)', () => {
    const { ctx, set } = fakeCtx(10)
    const s = new ClickScheduler(ctx, { lookahead: 0.1, intervalMs: 25 })
    s.add([click(10.05), click(10.1), click(10.2), click(20)])
    // margine di sicurezza = 10 + 0.1 + 0.025 = 10.125: il taglio richiesto (10.06) cade sotto,
    // quindi il taglio effettivo si sposta a 10.125 e 10.1 sopravvive.
    s.dropAfter(10.06)
    set(1000)
    s.start()
    expect(sounded.map((x) => x.t)).toEqual([10.05, 10.1])
    s.stop()
  })
})
