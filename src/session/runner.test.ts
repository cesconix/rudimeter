import { describe, expect, it } from 'bun:test'
import { SessionRunner, type RunnerDeps } from './runner'
import { parseExercise } from '../engine/exercise'
import type { Click } from '../engine/grid'
import type { Hit } from '../engine/types'

/**
 * `dropAfterReturns` simula il clamp del ClickSink reale (`ClickScheduler.dropAfter`): per default
 * ritorna esattamente il taglio richiesto (nessun clamp), ma un test può fargli ritornare un taglio
 * effettivo posticipato per verificare che il runner scarti i click aggiunti prima di quel punto.
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
        add: (c) => { entry.added.push(c) },
        dropAfter: (x) => {
          entry.droppedAfter.push(x)
          return opts.dropAfterReturns ? opts.dropAfterReturns(x) : x
        },
        stop: () => { entry.stopped = true },
      }
    },
    onHit: (l) => {
      listener = l
      return () => { listener = null }
    },
  }
  return { deps, scheduled, advance: (dt: number) => { t += dt }, hit: (h: Hit) => listener?.(h), hasListener: () => listener !== null }
}

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 1 })

describe('SessionRunner', () => {
  it('parte in count-in, schedula i click con accento sul primo movimento e corregge la latenza', () => {
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

  it('ignora i colpi durante il count-in', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    f.hit({ t: r.snapshot().grid.t0 + 0.5, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(0)
  })

  it('compensa la dinamica con la pendenza', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: 0.5 })
    r.start()
    f.hit({ t: r.snapshot().grid.slots[0].t, peakDb: -10 })
    expect(r.snapshot().hits[0].peakDb).toBeCloseTo(-20)
  })

  it('live: gli slot futuri sono pending; a fine griglia diventano miss e la fase è done', () => {
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

  it('stop anticipato chiude la sessione e notifica gli iscritti', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    const phases: string[] = []
    r.subscribe((s) => phases.push(s.phase))
    r.start()
    r.stop()
    expect(phases).toEqual(['count-in', 'done'])
    expect(r.tick()).toBeNull()
  })

  it('boundary: hit esattamente al limite countInEnd - minStepDur/2 viene mantenuto', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.minStepDur / 2
    f.hit({ t: boundary, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(1)
    expect(r.snapshot().result.judged[0].grade).not.toBe('miss')
  })

  it('boundary: hit leggermente prima del limite viene scartato', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.minStepDur / 2
    f.hit({ t: boundary - 0.01, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(0)
  })

  it('boundary: hit leggermente dopo il limite viene mantenuto', () => {
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

  it('dopo 2 ripetizioni pulite alza di 10 dalla ripetizione successiva a quella in corso e aggiorna i click', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots.filter((s) => s.repeat < 2).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats.map((x) => x.bpm)).toEqual([60, 60, 60, 70, 70, 70])
    expect(s.grid.repeats[3].start).toBeCloseTo(grid0.repeats[3].start, 6)
    expect(f.scheduled[0].droppedAfter).toEqual([s.grid.repeats[3].start])
    expect(f.scheduled[0].added[0]).toHaveLength(3 * 4)
    expect(s.bpm).toBe(60)
  })

  it('con un miss non alza', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots.filter((s) => s.repeat < 2 && s.index !== 3).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    expect(r.tick()!.grid.repeats.every((x) => x.bpm === 60)).toBe(true)
    expect(f.scheduled[0].added).toEqual([])
  })

  it('se il ClickSink posticipa il taglio (clamp), i click aggiunti restano tutti al taglio effettivo o dopo', () => {
    // Simula il clamp di ClickScheduler.dropAfter: il taglio effettivo torna 2 beat (al bpm nuovo,
    // 70) dopo quello richiesto — come se il margine audio già committato avesse divorato quel tratto.
    const beat = 60 / 70
    const f = fakeDeps({ dropAfterReturns: (requested) => requested + 2 * beat })
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots.filter((s) => s.repeat < 2).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    r.tick()
    const requested = f.scheduled[0].droppedAfter[0]
    const actualCut = requested + 2 * beat
    const added = f.scheduled[0].added[0]
    // repeat 3 (il primo ripianificato) ha 4 click a offset [0, beat, 2beat, 3beat] da `requested`:
    // i primi due (0 e beat) cadono prima del taglio effettivo e devono essere scartati; repeat 4 e
    // 5 restano interi (i loro click partono da 4beat, ben oltre il taglio effettivo).
    expect(added.every((c) => c.t >= actualCut)).toBe(true)
    expect(added).toHaveLength(3 * 4 - 2)
  })

  it('senza clamp (taglio effettivo = richiesto) tutti i click ripianificati vengono aggiunti', () => {
    const f = fakeDeps({ dropAfterReturns: (requested) => requested })
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots.filter((s) => s.repeat < 2).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    const requested = f.scheduled[0].droppedAfter[0]
    expect(requested).toBeCloseTo(s.grid.repeats[3].start, 6)
    expect(f.scheduled[0].added[0]).toHaveLength(3 * 4)
    expect(f.scheduled[0].added[0].every((c) => c.t >= requested)).toBe(true)
  })

  it('la ripetizione in corso al momento del rialzo non viene toccata dal replan (stessa istanza)', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    const inProgressBefore = grid0.repeats[2]
    grid0.slots.filter((s) => s.repeat < 2).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats[2]).toBe(inProgressBefore)
    expect(s.grid.repeats[2].slots.map((sl) => ({ t: sl.t, index: sl.index, dur: sl.dur }))).toEqual(
      inProgressBefore.slots.map((sl) => ({ t: sl.t, index: sl.index, dur: sl.dur })),
    )
  })

  it('più tick nella stessa ripetizione non alzano il bpm più di una volta', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex6, bpm: 60, latencyMs: 0, slope: null, autoIncrement: ai })
    r.start()
    const grid0 = r.snapshot().grid
    grid0.slots.filter((s) => s.repeat < 2).forEach((s) => { f.advance(s.t - f.deps.now()); f.hit({ t: s.t, peakDb: -20 }) })
    f.advance(grid0.repeats[2].start + 0.01 - f.deps.now())
    r.tick()
    r.tick()
    // biome-ignore lint/style/noNonNullAssertion: the runner is playing at this point, so tick() always returns a snapshot.
    const s = r.tick()!
    expect(s.grid.repeats.map((x) => x.bpm)).toEqual([60, 60, 60, 70, 70, 70])
    expect(f.scheduled[0].added).toHaveLength(1)
  })
})
