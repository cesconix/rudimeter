import { describe, expect, it } from 'bun:test'
import { frac } from './fraction'
import { buildTimeMap, firstTempo, secondsPerWhole, temposOf } from './timemap'
import type { Bar, Score } from './types'
import { unroll } from './unroll'

const bar = (extra: Partial<Bar> = {}): Bar => ({
  ...extra,
  parts: { pad: { voices: [{ stem: 'up', items: [{ duration: { base: 1 }, rest: true }] }] } },
})
const score = (bars: Bar[]): Score => ({ id: 't', title: 't', parts: [{ id: 'pad', kind: 'drumset' }], bars })
const map = (bars: Bar[], userBpm?: number) => {
  const s = score(bars)
  return buildTimeMap(s, unroll(s), userBpm)
}

describe('secondsPerWhole', () => {
  it('counts quarters by default, any unit when asked', () => {
    expect(secondsPerWhole({ bpm: 120 })).toBe(2)
    expect(secondsPerWhole({ bpm: 60, unit: 8 })).toBe(8)
    // ♩. = 60 in 6/8: a dotted quarter is 3/8 of a whole, so a whole lasts 8/3 s.
    expect(secondsPerWhole({ bpm: 60, unit: 4, dotted: true })).toBeCloseTo(8 / 3, 12)
  })
})

describe('temposOf / firstTempo', () => {
  it('carries the last mark forward and applies the first mark to the bars before it', () => {
    const bars = [bar({ meter: [4, 4] }), bar({ tempo: { bpm: 90 } }), bar(), bar({ tempo: { bpm: 100 } })]
    expect(temposOf(score(bars)).map((t) => t.bpm)).toEqual([90, 90, 90, 100])
    expect(firstTempo(score(bars))).toEqual({ bpm: 90 })
    expect(firstTempo(score([bar({ meter: [4, 4] })]))).toEqual({ bpm: 120, unit: 4 })
  })
})

describe('buildTimeMap', () => {
  it('is linear under one tempo', () => {
    const m = map([bar({ meter: [4, 4], tempo: { bpm: 120 } }), bar()])
    expect(m.end).toBe(4)
    expect(m.endPosition).toBe(2)
    expect(m.secondsAt(0)).toBe(0)
    expect(m.secondsAt(frac(1, 4))).toBe(0.5)
    expect(m.secondsAt(1.5)).toBe(3)
    expect(m.positionAt(3)).toBe(1.5)
  })
  it('changes speed where the tempo mark sits', () => {
    const m = map([bar({ meter: [4, 4], tempo: { bpm: 120 } }), bar({ tempo: { bpm: 60 } })])
    expect(m.secondsAt(1)).toBe(2)
    expect(m.secondsAt(2)).toBe(6)
    expect(m.positionAt(4)).toBe(1.5)
  })
  it('follows the playback order, so a repeated bar is counted twice', () => {
    const m = map([bar({ meter: [2, 4], tempo: { bpm: 120 }, repeat: { start: true, end: {} } }), bar()])
    expect(m.end).toBe(3)
    expect(m.endPosition).toBe(1.5)
  })
  it('scales every mark by the user bpm over the first mark', () => {
    const m = map([bar({ meter: [4, 4], tempo: { bpm: 120 } }), bar({ tempo: { bpm: 60 } })], 240)
    expect(m.secondsAt(1)).toBe(1)
    expect(m.secondsAt(2)).toBe(3)
    const noMark = map([bar({ meter: [4, 4] })], 60)
    expect(noMark.end).toBe(4)
  })
  it('clamps to the piece and inverts within rounding', () => {
    const m = map([
      bar({ meter: [4, 4], tempo: { bpm: 120 } }),
      bar({ tempo: { bpm: 90 } }),
      bar({ tempo: { bpm: 200 } }),
    ])
    expect(m.secondsAt(-1)).toBe(0)
    expect(m.secondsAt(99)).toBe(m.end)
    expect(m.positionAt(-1)).toBe(0)
    expect(m.positionAt(99)).toBe(m.endPosition)
    for (let p = 0; p <= 3; p += 0.125) expect(m.positionAt(m.secondsAt(p))).toBeCloseTo(p, 9)
  })
  it('is empty for an empty playback', () => {
    const m = buildTimeMap(score([bar({ meter: [4, 4] })]), [])
    expect(m.end).toBe(0)
    expect(m.secondsAt(1)).toBe(0)
    expect(m.positionAt(1)).toBe(0)
  })
})
