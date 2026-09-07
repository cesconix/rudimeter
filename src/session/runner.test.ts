import { describe, expect, it } from 'vitest'
import { SessionRunner, type RunnerDeps } from './runner'
import { parseExercise } from '../engine/exercise'
import type { Hit } from '../engine/types'

function fakeDeps() {
  let t = 100
  let listener: ((h: Hit) => void) | null = null
  const scheduled: { times: number[]; accentEvery: number; stopped: boolean }[] = []
  const deps: RunnerDeps = {
    now: () => t,
    scheduleClicks: (times, accentEvery) => {
      const entry = { times, accentEvery, stopped: false }
      scheduled.push(entry)
      return { stop: () => { entry.stopped = true } }
    },
    onHit: (l) => {
      listener = l
      return () => { listener = null }
    },
  }
  return { deps, scheduled, advance: (dt: number) => { t += dt }, hit: (h: Hit) => listener?.(h), hasListener: () => listener !== null }
}

const ex = parseExercise({ id: 'e', name: 'e', timeSignature: [2, 4], subdivision: 8, steps: 'RLRL RLRL', repeats: 1 })

describe('SessionRunner', () => {
  it('parte in count-in, schedula i click con accento sul primo beat e corregge la latenza', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 50, slope: null })
    r.start()
    expect(r.snapshot().phase).toBe('count-in')
    expect(f.scheduled[0].times).toHaveLength(2 + 4)
    expect(f.scheduled[0].accentEvery).toBe(2)
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
    const live = r.tick()!
    expect(live.phase).toBe('playing')
    expect(live.result.judged[7].grade).toBe('pending')
    f.advance(10)
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

  it('boundary: hit esattamente al limite countInEnd - stepDur/2 viene mantenuto', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.stepDur / 2
    f.hit({ t: boundary, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(1)
    expect(r.snapshot().result.judged[0].grade).not.toBe('miss')
  })

  it('boundary: hit leggermente prima del limite viene scartato', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.stepDur / 2
    f.hit({ t: boundary - 0.01, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(0)
  })

  it('boundary: hit leggermente dopo il limite viene mantenuto', () => {
    const f = fakeDeps()
    const r = new SessionRunner(f.deps, { exercise: ex, bpm: 60, latencyMs: 0, slope: null })
    r.start()
    const grid = r.snapshot().grid
    const boundary = grid.countInEnd - grid.stepDur / 2
    f.hit({ t: boundary + 0.01, peakDb: -20 })
    expect(r.snapshot().hits).toHaveLength(1)
    expect(r.snapshot().result.judged[0].grade).not.toBe('miss')
  })
})
