import { describe, expect, it } from 'bun:test'
import { bins, esc, histogramSvg, offsetsSvg, sparklineSvg, timelineSvg, timeScale } from './dashboard-svg'
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
  it('sparklineSvg ticks a dashed line in front of every gap index and ignores the ones out of range', () => {
    // 5 values over width 600: x(k) = 4 + k/4 * 592, so x(0) = 4.0, x(2) = 300.0, x(4) = 596.0.
    const svg = sparklineSvg([10, 11, 12, 11, 10], 600, 60, [2, 4, 5, -1])
    expect(svg.match(/class="gap"/g)).toHaveLength(2)
    expect(svg).toContain('<line class="gap" x1="300.0" x2="300.0" y1="4" y2="56"/>')
    expect(svg).toContain('<line class="gap" x1="596.0" x2="596.0" y1="4" y2="56"/>')
    expect(sparklineSvg([10, 11, 12], 600, 60)).not.toContain('class="gap"')
  })
  it('offsetsSvg draws the ok/good bands, clamps an out-of-range offset, and ticks a miss', () => {
    const a = {
      t0: 0,
      durationS: 1,
      notes: [
        {
          i: 0,
          bar: 0,
          beat: 0,
          sub: 0,
          hand: 'R',
          accent: false,
          t: 0,
          hitT: 0.01,
          offsetMs: 10,
          peakDb: -20,
          grade: 'good',
          flags: [],
        },
        {
          i: 1,
          bar: 0,
          beat: 1,
          sub: 0,
          hand: 'R',
          accent: false,
          t: 0.5,
          hitT: 0.43,
          offsetMs: -70,
          peakDb: -20,
          grade: 'off',
          flags: [],
        },
        {
          i: 2,
          bar: 0,
          beat: 2,
          sub: 0,
          hand: 'L',
          accent: false,
          t: 1,
          hitT: null,
          offsetMs: null,
          peakDb: null,
          grade: 'miss',
          flags: [],
        },
      ],
    } as unknown as SessionAnalysis
    const svg = offsetsSvg(a, 100)
    // h=100, mid=50, px(ms) = ms/40 * 44: ok band = px(40) = 44 -> y 6.0, height 88.0;
    // good band = px(20) = 22 -> y 28.0, height 44.0 (strictly inside the ok band).
    expect(svg).toContain('<rect class="band ok" x="20" y="6.0" width="120" height="88.0"/>')
    expect(svg).toContain('<rect class="band good" x="20" y="28.0" width="120" height="44.0"/>')
    expect(svg.match(/class="band /g)).toHaveLength(2)
    // -70 ms clamps to -okMs*1.15 = -46: px(-46) = -50.6, y2 = mid - (-50.6) = 100.6.
    expect(svg).toContain('class="offset off" x1="70.0" x2="70.0" y1="50.0" y2="100.6"')
    // +10 ms stays unclamped: px(10) = 11, y2 = mid - 11 = 39.0.
    expect(svg).toContain('class="offset good" x1="20.0" x2="20.0" y1="50.0" y2="39.0"')
    // a miss ignores offsetMs and ticks ±3 px around mid.
    expect(svg).toContain('class="offset miss" x1="120.0" x2="120.0" y1="47" y2="53"')
  })
  it('histogramSvg places grouped bars per series and a band line at the right x', () => {
    const series = [
      { label: 'R', values: [1, 2] },
      { label: 'L', values: [7] },
    ]
    expect(bins(series[0].values, 0, 10, 5)).toEqual([2, 0])
    expect(bins(series[1].values, 0, 10, 5)).toEqual([0, 1])
    const svg = histogramSvg(series, 0, 10, 5, { bands: [5] })
    // bw = (420 - 40) / 2 bins = 190; bar width = bw / 2 series - 1 = 94.0; s1's x leads s0's by bw/2 = 95.
    const bars = [...svg.matchAll(/<rect class="bar (s\d)" x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+">/g)]
    expect(bars).toHaveLength(4)
    for (const [, , , width] of bars) expect(width).toBe('94.0')
    const [s0k0, s0k1, s1k0, s1k1] = bars
    expect(Number(s1k0[2]) - Number(s0k0[2])).toBe(95)
    expect(Number(s1k1[2]) - Number(s0k1[2])).toBe(95)
    // one band line at x = 20 + (5/10) * 380 = 210.0.
    expect(svg.match(/class="band-line"/g)).toHaveLength(1)
    expect(svg).toContain('x1="210.0" x2="210.0"')
    expect(svg).toContain('>0</text>')
    expect(svg).toContain('>10</text>')
  })
  it('esc escapes the five reserved XML characters and passes plain text through', () => {
    expect(esc('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;')
    expect(esc('plain text')).toBe('plain text')
  })
})
