import { describe, expect, it } from 'bun:test'
import type { Bar, Score } from '../score/types'
import { clampBpm, DEFAULT_BPM, MAX_BPM, MIN_BPM, Transport } from './transport'

const bar = (extra: Partial<Bar> = {}): Bar => ({ ...extra, items: [{ duration: { base: 1 }, rest: true }] })
/** Two bars of 4/4 at 120 to the quarter: a whole note is 2 s, the piece 4 s. */
const TWO = (): Score => ({ id: 't', title: 't', bars: [bar({ meter: [4, 4] }), bar()] })
const make = (score = TWO(), bpm = 120) => {
  const clock = { currentTime: 0 }
  return { clock, t: new Transport(clock, score, bpm) }
}

describe('clampBpm', () => {
  it('rounds and clamps to [MIN_BPM, MAX_BPM]; anything not a number is the default', () => {
    expect(clampBpm(100.4)).toBe(100)
    expect(clampBpm(1000)).toBe(MAX_BPM)
    expect(clampBpm(0)).toBe(MIN_BPM)
    expect(clampBpm(Number.NaN)).toBe(DEFAULT_BPM)
  })
})

describe('Transport', () => {
  it('starts stopped at 0, with the playback, the events, the starts and the map of the piece', () => {
    const { t } = make()
    expect(t.state).toBe('stopped')
    expect(t.bpm).toBe(120)
    expect(t.secondsAt(99)).toBe(0)
    expect(t.positionAt(99)).toBe(0)
    expect(t.playback.map((pb) => pb.barIndex)).toEqual([0, 1])
    expect(t.events.length).toBe(2)
    expect(t.starts).toEqual([0, 1])
    expect(t.timeMap.end).toBe(4)
  })

  it('play runs from the clock at the moment of play; pause holds; play resumes from there', () => {
    const { clock, t } = make()
    clock.currentTime = 10
    t.play()
    expect(t.state).toBe('playing')
    expect(t.secondsAt(11)).toBe(1)
    expect(t.positionAt(11)).toBe(0.5)
    clock.currentTime = 11.5
    t.pause()
    expect(t.state).toBe('paused')
    expect(t.secondsAt(20)).toBe(1.5)
    clock.currentTime = 20
    t.play()
    expect(t.secondsAt(21)).toBe(2.5)
  })

  it('before the clock reaches the start the position is 0, not negative', () => {
    const { clock, t } = make()
    clock.currentTime = 10
    t.play()
    expect(t.secondsAt(9.98)).toBe(0)
  })

  it('stop goes back to 0', () => {
    const { clock, t } = make()
    t.play()
    clock.currentTime = 1
    t.stop()
    expect(t.state).toBe('stopped')
    expect(t.secondsAt(5)).toBe(0)
  })

  it('seek lands on the bar start, while stopped and while playing', () => {
    const { clock, t } = make()
    t.seek(1)
    expect(t.positionAt(0)).toBe(1)
    expect(t.secondsAt(0)).toBe(2)
    clock.currentTime = 30
    t.play()
    clock.currentTime = 30.5
    t.seek(0)
    expect(t.secondsAt(30.5)).toBe(0)
    expect(t.secondsAt(31.5)).toBe(1)
  })

  it('seek to a pass lands on that pass; a pass the bar has not got falls back to its first; an unknown bar to 0', () => {
    const score: Score = {
      id: 'e',
      title: 'e',
      bars: [bar({ meter: [4, 4], repeat: { start: true } }), bar({ repeat: { end: {} } }), bar()],
    }
    const { t } = make(score)
    // playback: bar 0 (pass 1), bar 1 (pass 1), bar 0 (pass 2), bar 1 (pass 2), bar 2
    expect(t.starts).toEqual([0, 1, 2, 3, 4])
    t.seek(0, 2)
    expect(t.positionAt(0)).toBe(2)
    t.seek(1, 3)
    expect(t.positionAt(0)).toBe(1)
    t.seek(7)
    expect(t.positionAt(0)).toBe(0)
  })

  it('setBpm while playing keeps the position and changes the speed from there', () => {
    const { clock, t } = make()
    clock.currentTime = 40
    t.play()
    clock.currentTime = 41
    expect(t.positionAt(41)).toBe(0.5)
    t.setBpm(60)
    expect(t.bpm).toBe(60)
    expect(t.positionAt(41)).toBe(0.5)
    // at 60 a whole note is 4 s: one more second is a quarter, not a half
    expect(t.positionAt(42)).toBe(0.75)
    expect(t.timeMap.end).toBe(8)
  })

  it('setBpm clamps, and the same bpm again is not a change', () => {
    const { t } = make()
    let calls = 0
    t.subscribe(() => calls++)
    t.setBpm(1000)
    expect(t.bpm).toBe(MAX_BPM)
    t.setBpm(MAX_BPM)
    expect(calls).toBe(1)
  })

  it('tick past the end stops the transport with the position held at the end; play again starts over', () => {
    const { clock, t } = make()
    t.play()
    t.tick(3.9)
    expect(t.state).toBe('playing')
    t.tick(4)
    expect(t.state).toBe('stopped')
    expect(t.secondsAt(100)).toBe(4)
    expect(t.positionAt(100)).toBe(2)
    clock.currentTime = 50
    t.play()
    expect(t.secondsAt(50)).toBe(0)
    expect(t.secondsAt(51)).toBe(1)
  })

  it('tick does nothing while paused or stopped', () => {
    const { t } = make()
    t.tick(100)
    expect(t.state).toBe('stopped')
    expect(t.secondsAt(100)).toBe(0)
  })

  it('subscribe hears every change and unsubscribe stops it', () => {
    const { t } = make()
    const seen: string[] = []
    const off = t.subscribe(() => seen.push(t.state))
    t.play()
    t.pause()
    t.seek(1)
    t.setBpm(90)
    t.stop()
    expect(seen).toEqual(['playing', 'paused', 'paused', 'paused', 'stopped'])
    off()
    t.play()
    expect(seen.length).toBe(5)
  })
})
