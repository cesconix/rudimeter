import { toNumber } from '../score/fraction'
import { buildTimeMap, type TimeMap } from '../score/timemap'
import type { Score } from '../score/types'
import { barStarts, eventsOf, type PlaybackBar, type PlaybackEvent, unroll } from '../score/unroll'

/**
 * What the transport reads: the `AudioContext` in the app, a plain object in the tests. It is the
 * scheduling clock — the click, later, is booked on it — and never `Date.now()`: the two drift,
 * and a cursor on the wall clock would leave the sound it is meant to follow.
 */
export interface Clock {
  readonly currentTime: number
}

export type TransportState = 'stopped' | 'playing' | 'paused'

export const MIN_BPM = 30
export const MAX_BPM = 300
export const DEFAULT_BPM = 100

/** An integer inside the range; anything that is not a number is the default (the storage may hand back anything). */
export const clampBpm = (bpm: number): number =>
  Number.isFinite(bpm) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm))) : DEFAULT_BPM

/**
 * Play, pause, stop, seek and tempo over a piece, on the audio clock. The state is two numbers —
 * the playback position when play started (`posAtStart`) and the clock then (`startedAt`) — so
 * a frame asks `positionAt(now)` and nothing accumulates. No sound: the click and the count-in
 * come later on the same clock.
 */
export class Transport {
  readonly playback: PlaybackBar[]
  readonly events: PlaybackEvent[]
  /** playback position where each emitted bar starts, whole-note units: what a seek lands on and what the view reads the current bar from */
  readonly starts: number[]
  /** replaced whole by `setBpm`; readers take it fresh every time */
  timeMap: TimeMap
  private stateValue: TransportState = 'stopped'
  private bpmValue: number
  private posAtStart = 0
  private startedAt = 0
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly clock: Clock,
    readonly score: Score,
    bpm: number,
  ) {
    this.playback = unroll(score)
    this.events = eventsOf(score, this.playback)
    this.starts = barStarts(score, this.playback).map(toNumber)
    this.bpmValue = clampBpm(bpm)
    this.timeMap = buildTimeMap(score, this.playback, this.bpmValue)
  }

  get state(): TransportState {
    return this.stateValue
  }

  get bpm(): number {
    return this.bpmValue
  }

  /** An arrow so React can take it unbound (`useSyncExternalStore(transport.subscribe, …)`). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }

  /** playback seconds at `now` (the clock's time), clamped to the piece: what the overlay reads */
  secondsAt(now: number): number {
    const base = this.timeMap.secondsAt(this.posAtStart)
    const s = this.stateValue === 'playing' ? base + (now - this.startedAt) : base
    return Math.min(this.timeMap.end, Math.max(0, s))
  }

  /** playback position (whole-note units) at `now` */
  positionAt(now: number): number {
    return this.timeMap.positionAt(this.secondsAt(now))
  }

  play(): void {
    if (this.stateValue === 'playing') return
    // At the end, Play starts over: a transport holding the last position has nothing left to play.
    if (this.posAtStart >= this.timeMap.endPosition) this.posAtStart = 0
    this.startedAt = this.clock.currentTime
    this.stateValue = 'playing'
    this.notify()
  }

  pause(): void {
    if (this.stateValue !== 'playing') return
    this.posAtStart = this.positionAt(this.clock.currentTime)
    this.stateValue = 'paused'
    this.notify()
  }

  stop(): void {
    this.posAtStart = 0
    this.stateValue = 'stopped'
    this.notify()
  }

  /**
   * To the start of a written bar on a given pass; a pass the bar has not got (a bar outside the
   * repeated section, asked for on pass 2) lands on the bar's first pass, and a bar the piece does
   * not have on 0.
   */
  seek(barIndex: number, pass = 1): void {
    const exact = this.playback.findIndex((pb) => pb.barIndex === barIndex && pb.pass === pass)
    const i = exact >= 0 ? exact : this.playback.findIndex((pb) => pb.barIndex === barIndex)
    this.posAtStart = i >= 0 ? this.starts[i] : 0
    if (this.stateValue === 'playing') this.startedAt = this.clock.currentTime
    this.notify()
  }

  /** A new speed from the current position: the cursor does not jump, it changes pace. */
  setBpm(bpm: number): void {
    const next = clampBpm(bpm)
    if (next === this.bpmValue) return
    const now = this.clock.currentTime
    if (this.stateValue === 'playing') {
      this.posAtStart = this.positionAt(now)
      this.startedAt = now
    }
    this.bpmValue = next
    this.timeMap = buildTimeMap(this.score, this.playback, next)
    this.notify()
  }

  /** Once a frame: the end of the piece stops the transport with the position held there. */
  tick(now: number): void {
    if (this.stateValue !== 'playing') return
    if (this.secondsAt(now) >= this.timeMap.end) {
      this.posAtStart = this.timeMap.endPosition
      this.stateValue = 'stopped'
      this.notify()
    }
  }
}
