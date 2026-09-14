// SVG for the dashboard, as strings: a timeline of clicks, expected notes and hits, an offset strip,
// histograms and sparklines. Pure — the page sets innerHTML, the tests read the markup.
import type { SessionAnalysis } from '../src/analysis/analysis'

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface Scale {
  x(t: number): number
  width: number
}

export function timeScale(t0: number, t1: number, pxPerSec: number, pad = 20): Scale {
  const span = Math.max(t1 - t0, 0.001)
  return { x: (t) => pad + (t - t0) * pxPerSec, width: Math.ceil(pad * 2 + span * pxPerSec) }
}

export function bins(values: number[], from: number, to: number, step: number): number[] {
  const out = new Array<number>(Math.ceil((to - from) / step)).fill(0)
  for (const v of values) {
    const k = Math.floor((v - from) / step)
    if (k >= 0 && k < out.length) out[k]++
  }
  return out
}

const LANE = { clicks: 22, R: 64, L: 104, extra: 144 } as const
const HEIGHT = 168
const fmt = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))

/** Clicks, expected notes (hollow), assigned hits (filled by grade), extras (×); flags as classes and marks. */
export function timelineSvg(a: SessionAnalysis, pxPerSec: number): string {
  const s = timeScale(a.t0, a.t0 + a.durationS, pxPerSec)
  const parts: string[] = []
  parts.push(`<svg class="timeline" width="${s.width}" height="${HEIGHT}" viewBox="0 0 ${s.width} ${HEIGHT}">`)
  for (const [name, y] of Object.entries(LANE))
    parts.push(
      `<text x="2" y="${y + 4}" class="lane">${name}</text><line x1="20" x2="${s.width}" y1="${y}" y2="${y}" class="rail"/>`,
    )
  for (const c of a.clicks) {
    const x = s.x(c.t).toFixed(1)
    parts.push(
      `<line class="click ${esc(c.kind)}" x1="${x}" x2="${x}" y1="${LANE.clicks - 10}" y2="${LANE.clicks + 10}"${c.silent ? ' stroke-dasharray="2 2"' : ''}><title>click ${esc(c.kind)} @ ${c.t.toFixed(3)} s${c.silent ? ' (silent)' : ''}</title></line>`,
    )
  }
  for (const n of a.notes) {
    const y = LANE[n.hand]
    const x = s.x(n.t).toFixed(1)
    parts.push(
      `<circle class="slot ${n.grade}${n.accent ? ' accent' : ''}" cx="${x}" cy="${y}" r="${n.accent ? 7 : 5}"><title>note ${n.i} · bar ${n.bar} beat ${n.beat} sub ${n.sub} · ${n.hand}${n.accent ? ' accent' : ''} · expected ${n.t.toFixed(3)} s · ${n.grade}</title></circle>`,
    )
    if (n.hitT !== null) {
      const hx = s.x(n.hitT).toFixed(1)
      const r = n.peakDb === null ? 4 : Math.max(2.5, 4 + (n.peakDb + 40) / 8)
      parts.push(
        `<circle class="hit ${n.grade} ${n.flags.join(' ')}" cx="${hx}" cy="${y}" r="${r.toFixed(1)}"><title>hit @ ${n.hitT.toFixed(3)} s · offset ${fmt(n.offsetMs)} ms · ${fmt(n.peakDb)} dB${n.flags.length ? ` · ${n.flags.join(', ')}` : ''}</title></circle>`,
      )
      if (n.flags.includes('double')) parts.push(`<text x="${hx}" y="${y - 9}" class="mark">2</text>`)
    }
  }
  for (const e of a.extras) {
    const x = s.x(e.t).toFixed(1)
    const y = LANE.extra
    parts.push(
      `<g class="extra ${e.flags.join(' ')}"><line x1="${x}" x2="${x}" y1="${y - 5}" y2="${y + 5}"/><line x1="${(s.x(e.t) - 5).toFixed(1)}" x2="${(s.x(e.t) + 5).toFixed(1)}" y1="${y}" y2="${y}"/><title>extra @ ${e.t.toFixed(3)} s · ${e.peakDb.toFixed(1)} dB${e.flags.length ? ` · ${e.flags.join(', ')}` : ''}</title></g>`,
    )
    if (e.flags.includes('double')) parts.push(`<text x="${x}" y="${y - 9}" class="mark">2</text>`)
  }
  parts.push('</svg>')
  return parts.join('')
}

/** Offset per note as a bar around zero, ±40 ms full scale, the good/ok windows as bands. */
export function offsetsSvg(a: SessionAnalysis, pxPerSec: number, goodMs = 20, okMs = 40): string {
  const s = timeScale(a.t0, a.t0 + a.durationS, pxPerSec)
  const h = 100
  const mid = h / 2
  const px = (msv: number): number => (msv / okMs) * (mid - 6)
  const parts: string[] = [`<svg class="offsets" width="${s.width}" height="${h}" viewBox="0 0 ${s.width} ${h}">`]
  parts.push(
    `<rect class="band ok" x="20" y="${(mid - px(okMs)).toFixed(1)}" width="${s.width - 20}" height="${(2 * px(okMs)).toFixed(1)}"/>`,
  )
  parts.push(
    `<rect class="band good" x="20" y="${(mid - px(goodMs)).toFixed(1)}" width="${s.width - 20}" height="${(2 * px(goodMs)).toFixed(1)}"/>`,
  )
  parts.push(`<line class="rail" x1="20" x2="${s.width}" y1="${mid}" y2="${mid}"/>`)
  for (const n of a.notes) {
    const x = s.x(n.t).toFixed(1)
    if (n.offsetMs === null) {
      parts.push(`<line class="offset miss" x1="${x}" x2="${x}" y1="${mid - 3}" y2="${mid + 3}"/>`)
      continue
    }
    const v = Math.max(-okMs * 1.15, Math.min(okMs * 1.15, n.offsetMs))
    const y1 = mid
    const y2 = mid - px(v)
    parts.push(
      `<line class="offset ${n.grade}" x1="${x}" x2="${x}" y1="${y1.toFixed(1)}" y2="${y2.toFixed(1)}"><title>note ${n.i} · ${n.offsetMs.toFixed(1)} ms</title></line>`,
    )
  }
  parts.push('</svg>')
  return parts.join('')
}

export function histogramSvg(
  series: { label: string; values: number[] }[],
  from: number,
  to: number,
  step: number,
  opts: { width?: number; height?: number; bands?: number[] } = {},
): string {
  const width = opts.width ?? 420
  const height = opts.height ?? 120
  const counts = series.map((s) => bins(s.values, from, to, step))
  const n = counts[0]?.length ?? 0
  const max = Math.max(1, ...counts.flat())
  const bw = (width - 40) / Math.max(n, 1)
  const parts = [`<svg class="histogram" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`]
  for (const b of opts.bands ?? []) {
    const x = 20 + ((b - from) / (to - from)) * (width - 40)
    parts.push(`<line class="band-line" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="10" y2="${height - 20}"/>`)
  }
  counts.forEach((c, si) => {
    c.forEach((v, k) => {
      const bh = (v / max) * (height - 34)
      const x = 20 + k * bw + (si * bw) / series.length
      parts.push(
        `<rect class="bar s${si}" x="${x.toFixed(1)}" y="${(height - 20 - bh).toFixed(1)}" width="${(bw / series.length - 1).toFixed(1)}" height="${bh.toFixed(1)}"><title>${esc(series[si].label)} ${(from + k * step).toFixed(0)}…${(from + (k + 1) * step).toFixed(0)}: ${v}</title></rect>`,
      )
    })
  })
  parts.push(
    `<text x="20" y="${height - 6}" class="axis">${from}</text><text x="${width - 20}" y="${height - 6}" class="axis" text-anchor="end">${to}</text>`,
  )
  parts.push('</svg>')
  return parts.join('')
}

/**
 * `gaps` are indices into `values`: a dashed vertical line goes in front of sample `k`, where the
 * clock jumped (the tab was hidden, the context suspended) and the polyline between k−1 and k joins
 * two samples that are not a step apart.
 */
export function sparklineSvg(values: number[], width = 600, height = 60, gaps: number[] = []): string {
  const parts = [`<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`]
  if (values.length) {
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = Math.max(hi - lo, 0.001)
    const at = (k: number): number => 4 + (k / Math.max(values.length - 1, 1)) * (width - 8)
    const pts = values.map(
      (v, k) => `${at(k).toFixed(1)},${(height - 4 - ((v - lo) / span) * (height - 8)).toFixed(1)}`,
    )
    for (const k of gaps) {
      if (k < 0 || k >= values.length) continue
      const x = at(k).toFixed(1)
      parts.push(`<line class="gap" x1="${x}" x2="${x}" y1="4" y2="${height - 4}"/>`)
    }
    parts.push(`<polyline points="${pts.join(' ')}"/>`)
    parts.push(
      `<text x="4" y="12" class="axis">${hi.toFixed(1)}</text><text x="4" y="${height - 6}" class="axis">${lo.toFixed(1)}</text>`,
    )
  }
  parts.push('</svg>')
  return parts.join('')
}
