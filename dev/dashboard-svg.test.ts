import { describe, expect, it } from 'bun:test'
import { bins, sparklineSvg, timelineSvg, timeScale } from './dashboard-svg'
import type { SessionAnalysis } from './remote/analysis'

describe('dashboard-svg', () => {
  it('timeScale maps t0 to the left pad and t1 to width minus pad', () => {
    const s = timeScale(10, 20, 50, 20)
    expect(s.x(10)).toBe(20)
    expect(s.x(20)).toBe(520)
    expect(s.width).toBe(540)
  })
  it('bins counts values into fixed steps and drops the ones outside', () => {
    expect(bins([-7, -1, 0, 4, 4.9, 5, 12, 99], -10, 10, 5)).toEqual([1, 1, 3, 1])
  })
  it('timelineSvg draws one expected circle per note and one dot per assigned hit, flags included', () => {
    const a = {
      t0: 1,
      durationS: 1.5,
      clicks: [
        { t: 1, kind: 'beat', silent: false },
        { t: 1.5, kind: 'beat', silent: true },
      ],
      notes: [
        {
          i: 0,
          bar: 0,
          beat: 0,
          sub: 0,
          hand: 'R',
          accent: true,
          t: 1,
          hitT: 1.005,
          offsetMs: 5,
          peakDb: -20,
          grade: 'good',
          flags: ['echo'],
        },
        {
          i: 1,
          bar: 0,
          beat: 1,
          sub: 0,
          hand: 'L',
          accent: false,
          t: 1.5,
          hitT: null,
          offsetMs: null,
          peakDb: null,
          grade: 'miss',
          flags: [],
        },
        {
          i: 2,
          bar: 0,
          beat: 2,
          sub: 0,
          hand: 'R',
          accent: false,
          t: 2,
          hitT: 2.03,
          offsetMs: 30,
          peakDb: -22,
          grade: 'ok',
          flags: [],
        },
      ],
      extras: [{ t: 1.06, peakDb: -34, flags: ['double'] }],
    } as unknown as SessionAnalysis
    const svg = timelineSvg(a, 100)
    expect(svg.match(/class="slot /g)).toHaveLength(3)
    expect(svg.match(/class="hit /g)).toHaveLength(2)
    expect(svg).toContain('class="hit good echo')
    expect(svg).toContain('class="extra double')
    expect(svg.match(/class="click/g)).toHaveLength(2)
    expect(svg).toContain('stroke-dasharray')
  })
  it('sparklineSvg is empty for no values and a polyline otherwise', () => {
    expect(sparklineSvg([])).toContain('<svg')
    expect(sparklineSvg([1, 2, 3])).toContain('<polyline')
  })
})
