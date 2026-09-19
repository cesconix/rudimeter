// Dev tool: a MusicXML file (written in MuseScore) → one JSON score under src/data/scores/. The app
// bundles the JSON and never sees XML. Partwise files only, first part only, one staff.

import { parseArgs } from 'node:util'
import { XMLParser } from 'fast-xml-parser'
import { CATALOGUE, INSTRUMENT_IDS } from '../src/score/instruments'
import type {
  Bar,
  Dots,
  Dynamic,
  Event,
  Grace,
  Hairpin,
  Hand,
  InstrumentId,
  Item,
  Meter,
  Note,
  NoteBase,
  Notehead,
  Score,
  Tempo,
  TupletGroup,
  Voice,
} from '../src/score/types'
import { parseScore } from '../src/score/validate'

/** With `preserveOrder` every element is `{ [tag]: children[], ':@'?: attributes }` and text is `{ '#text': string }`: order inside a measure is the music. */
type XNode = Record<string, unknown>
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  parseTagValue: false,
  trimValues: true,
})

const tagOf = (n: XNode): string => Object.keys(n).find((k) => k !== ':@') ?? ''
const kids = (n: XNode): XNode[] => (n[tagOf(n)] as XNode[] | undefined) ?? []
const attrs = (n: XNode): Record<string, string> => (n[':@'] as Record<string, string> | undefined) ?? {}
const children = (n: XNode, tag: string): XNode[] => kids(n).filter((c) => tagOf(c) === tag)
const child = (n: XNode, tag: string): XNode | undefined => children(n, tag)[0]
const has = (n: XNode, tag: string): boolean => child(n, tag) !== undefined
const text = (n: XNode | undefined): string =>
  n ? ((kids(n).find((c) => '#text' in c)?.['#text'] as string | undefined) ?? '') : ''
const textOf = (n: XNode, tag: string): string => text(child(n, tag))

const TYPES: Record<string, NoteBase> = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32 }
const HEADS: Record<string, Notehead> = {
  normal: 'normal',
  x: 'x',
  'circle-x': 'circle-x',
  diamond: 'diamond',
  triangle: 'triangle',
  slash: 'slash',
}
const DYNAMICS = new Set<string>(['pp', 'p', 'mp', 'mf', 'f', 'ff'])
const WEDGES: Record<string, Hairpin> = { crescendo: 'cresc', diminuendo: 'dim', stop: 'stop' }
/** Notations we read or knowingly skip; anything else is worth a warning. */
const KNOWN_NOTATIONS = new Set(['tied', 'tuplet', 'articulations', 'technical', 'ornaments'])
const KNOWN_MEASURE_CHILDREN = new Set([
  'attributes',
  'barline',
  'print',
  'backup',
  'forward',
  'sound',
  'direction',
  'note',
])

/** MuseScore's drumset names → ours. Order matters: "Ride Bell" before "Ride", "Pedal Hi-Hat" before "Hi-Hat", "Low Floor Tom" before "Floor". */
const NAMES: [RegExp, InstrumentId, Partial<Note>?][] = [
  [/ride bell|\bbell\b/i, 'ride-bell'],
  [/ride/i, 'ride'],
  [/pedal hi|hi-?hat.*(pedal|foot)/i, 'hihat-pedal'],
  [/open hi/i, 'hihat', { open: true }],
  [/hi-?hat/i, 'hihat'],
  [/crash|china|splash/i, 'crash'],
  [/side stick|cross|rim ?click/i, 'cross-stick'],
  [/snare/i, 'snare'],
  [/bass|kick/i, 'kick'],
  [/low floor|floor tom 2|floor 2/i, 'tom-floor-low'],
  [/floor/i, 'tom-floor'],
  [/high tom|hi tom|tom 1\b|high-mid|hi-mid/i, 'tom-high'],
  [/mid|low tom|tom 2\b|tom 3\b/i, 'tom-mid'],
]

/** Staff line of a display step on the percussion staff, read as treble: E4 is the first line, each letter is half a line. */
function lineOf(step: string, octave: number): number {
  const index = octave * 7 + 'CDEFGAB'.indexOf(step.toUpperCase())
  return (index - 30) / 2
}

type Warn = (message: string) => void

/** The instrument of a note: by MuseScore's name when the file has one, else by position and notehead; a snare with a warning when neither works. */
function noteOf(n: XNode, names: Map<string, string>, warn: Warn): Note {
  const ref = child(n, 'instrument')
  const name = ref ? (names.get(attrs(ref).id) ?? '') : ''
  const headEl = child(n, 'notehead')
  const head = HEADS[text(headEl)]
  const match = name ? NAMES.find(([re]) => re.test(name)) : undefined
  let id: InstrumentId | undefined = match?.[1]
  if (!id) {
    const up = child(n, 'unpitched')
    if (up) {
      const line = lineOf(textOf(up, 'display-step'), Number(textOf(up, 'display-octave')))
      const h: Notehead = head ?? 'normal'
      id = INSTRUMENT_IDS.find((i) => CATALOGUE[i].line === line && CATALOGUE[i].head === h)
    }
  }
  if (!id) {
    warn(`instrument "${name || '?'}" unknown, written as snare`)
    id = 'snare'
  }
  const note: Note = { instrument: id }
  if (match?.[2]?.open) note.open = true
  if (headEl && attrs(headEl).parentheses === 'yes') note.ghost = true
  if (head && head !== CATALOGUE[id].head) note.head = head
  return note
}

const handOf = (n: XNode): Hand | undefined => {
  for (const nt of children(n, 'notations')) {
    const tech = child(nt, 'technical')
    const f = tech ? textOf(tech, 'fingering') : ''
    if (f === 'R' || f === 'L') return f
  }
  const lyric = child(n, 'lyric')
  const t = lyric ? textOf(lyric, 'text') : ''
  return t === 'R' || t === 'L' ? t : undefined
}

interface VoiceState {
  items: Item[]
  open: TupletGroup | null
  graces: XNode[]
  last: Event | null
}
interface Pending {
  dynamic?: Dynamic
  hairpin?: Hairpin
  text?: string
}

/** Bar keys in reading order, so the JSON reads like the spec. */
function ordered(bar: Bar): Bar {
  const out: Bar = {}
  for (const k of ['meter', 'beams', 'tempo', 'repeat', 'ending', 'simile', 'newRow', 'parts'] as const) {
    if (bar[k] !== undefined) Object.assign(out, { [k]: bar[k] })
  }
  return out
}

export function importMusicXml(
  xml: string,
  opts: { id: string; title?: string; source?: string },
): { score: Score; warnings: string[] } {
  const warnings: string[] = []
  const root = parser.parse(xml) as XNode[]
  const partwise = root.find((n) => tagOf(n) === 'score-partwise')
  if (!partwise) throw new Error('not a partwise MusicXML file')
  const names = new Map<string, string>()
  const partList = child(partwise, 'part-list')
  if (partList)
    for (const sp of children(partList, 'score-part'))
      for (const si of children(sp, 'score-instrument')) names.set(attrs(si).id, textOf(si, 'instrument-name'))
  const part = child(partwise, 'part')
  if (!part) throw new Error('no <part>')

  const bars: Bar[] = []
  let meter: Meter | undefined
  let ending: number[] | null = null
  let simileOpen = false
  for (const m of children(part, 'measure')) {
    const number = attrs(m).number ?? String(bars.length + 1)
    const warn: Warn = (message) => warnings.push(`measure ${number}: ${message}`)
    const bar: Bar = {}

    for (const a of children(m, 'attributes')) {
      const t = child(a, 'time')
      if (t) {
        const next: Meter = [Number(textOf(t, 'beats')), Number(textOf(t, 'beat-type'))]
        if (!meter || next[0] !== meter[0] || next[1] !== meter[1]) bar.meter = next
        meter = next
      }
      const style = child(a, 'measure-style')
      const mr = style && child(style, 'measure-repeat')
      if (mr) {
        simileOpen = attrs(mr).type === 'start'
        if (simileOpen && text(mr) !== '1') warn(`measure-repeat of ${text(mr)} bars read as one`)
      }
    }
    if (bars.length === 0 && !bar.meter) {
      if (!meter) warn('no time signature, assuming 4/4')
      meter = meter ?? [4, 4]
      bar.meter = meter
    }
    if (bars.length > 0 && children(m, 'print').some((p) => attrs(p)['new-system'] === 'yes')) bar.newRow = true

    for (const bl of children(m, 'barline')) {
      const rep = child(bl, 'repeat')
      if (rep) {
        if (attrs(rep).direction === 'forward') bar.repeat = { ...bar.repeat, start: true }
        else bar.repeat = { ...bar.repeat, end: attrs(rep).times ? { times: Number(attrs(rep).times) } : {} }
      }
      const en = child(bl, 'ending')
      if (en) {
        const numbers = attrs(en)
          .number.split(/[,\s]+/)
          .filter(Boolean)
          .map(Number)
        if (attrs(en).type === 'start') ending = numbers
        else {
          bar.ending = ending ?? numbers
          ending = null
        }
      }
    }
    if (ending) bar.ending = ending

    if (simileOpen) {
      bar.simile = true
      bars.push(ordered(bar))
      continue
    }

    const voices = new Map<number, VoiceState>()
    const voiceOf = (k: number): VoiceState => {
      let v = voices.get(k)
      if (!v) {
        v = { items: [], open: null, graces: [], last: null }
        voices.set(k, v)
      }
      return v
    }
    let pending: Pending = {}
    for (const el of kids(m)) {
      const tag = tagOf(el)
      if (tag === 'direction') {
        for (const dt of children(el, 'direction-type')) {
          const met = child(dt, 'metronome')
          if (met) {
            const tempo: Tempo = { bpm: Number(textOf(met, 'per-minute')) }
            const unit = TYPES[textOf(met, 'beat-unit')]
            if (unit && unit !== 4) tempo.unit = unit
            if (has(met, 'beat-unit-dot')) tempo.dotted = true
            bar.tempo = tempo
          }
          const dyn = child(dt, 'dynamics')
          if (dyn) {
            const d = tagOf(kids(dyn)[0] ?? {})
            if (DYNAMICS.has(d)) pending.dynamic = d as Dynamic
            else warn(`dynamic "${d}" ignored`)
          }
          const wedge = child(dt, 'wedge')
          if (wedge) pending.hairpin = WEDGES[attrs(wedge).type]
          const words = child(dt, 'words')
          if (words) pending.text = text(words)
        }
        const sound = child(el, 'sound')
        if (sound && attrs(sound).tempo && !bar.tempo) bar.tempo = { bpm: Number(attrs(sound).tempo) }
        continue
      }
      if (tag !== 'note') {
        if (!KNOWN_MEASURE_CHILDREN.has(tag)) warn(`<${tag}> ignored`)
        continue
      }
      const voiceNo = Number(textOf(el, 'voice') || '1')
      const v = voiceOf(voiceNo)
      if (has(el, 'grace')) {
        v.graces.push(el)
        continue
      }
      const rest = has(el, 'rest')
      const note = rest ? null : noteOf(el, names, warn)
      if (has(el, 'chord') && v.last) {
        if (note) {
          v.last.notes ??= []
          v.last.notes.push(note)
        }
        continue
      }
      const base = TYPES[textOf(el, 'type')]
      if (!base) {
        warn(`note type "${textOf(el, 'type')}" unsupported, skipped`)
        continue
      }
      const dots = children(el, 'dot').length as Dots
      const e: Event = { duration: dots ? { base, dots } : { base } }
      if (note) e.notes = [note]
      else {
        e.rest = true
        if (attrs(el)['print-object'] === 'no') e.hidden = true
      }
      let tupletStop = false
      for (const nt of children(el, 'notations')) {
        if (note && children(nt, 'tied').some((t) => attrs(t).type === 'start')) note.tie = true
        const art = child(nt, 'articulations')
        if (art && (has(art, 'accent') || has(art, 'strong-accent'))) e.accent = true
        const tech = child(nt, 'technical')
        if (tech && note) {
          if (has(tech, 'open') || has(tech, 'open-string')) note.open = true
          if (has(tech, 'stopped')) note.closed = true
        }
        const orn = child(nt, 'ornaments')
        const tr = orn && child(orn, 'tremolo')
        if (tr) {
          const slashes = Math.min(3, Math.max(1, Number(text(tr)) || 1)) as 1 | 2 | 3
          e.roll = attrs(tr).type === 'unmeasured' ? { kind: 'buzz' } : { kind: 'tremolo', slashes }
        }
        if (children(nt, 'tuplet').some((t) => attrs(t).type === 'stop')) tupletStop = true
        for (const k of kids(nt)) if (!KNOWN_NOTATIONS.has(tagOf(k))) warn(`<${tagOf(k)}> ignored`)
      }
      const hand = handOf(el)
      if (hand) e.sticking = hand
      const beam = children(el, 'beam').find((b) => (attrs(b).number ?? '1') === '1')
      const mark = beam ? text(beam) : ''
      if (mark === 'begin' || mark === 'continue' || mark === 'end') e.beam = mark
      if (v.graces.length > 0) {
        const graces = v.graces
        v.graces = []
        if (graces.length > 2) warn(`${graces.length} grace notes, kept as a drag`)
        const grace: Grace = { kind: graces.length === 1 ? 'flam' : 'drag' }
        const gn = noteOf(graces[0], names, warn)
        if (note && gn.instrument !== note.instrument) grace.instrument = gn.instrument
        const gh = handOf(graces[0])
        if (gh) grace.sticking = gh
        e.grace = grace
      }
      // Directions (dynamics, hairpins, words) belong to the next event of voice 1, rest or note.
      if (voiceNo === 1) {
        Object.assign(e, pending)
        pending = {}
      }
      const tm = child(el, 'time-modification')
      if (tm && !v.open) {
        v.open = {
          tuplet: { actual: Number(textOf(tm, 'actual-notes')), normal: Number(textOf(tm, 'normal-notes')) },
          items: [],
        }
        v.items.push(v.open)
      } else if (!tm && v.open) v.open = null
      if (v.open) v.open.items.push(e)
      else v.items.push(e)
      if (tupletStop) v.open = null
      v.last = e
    }
    const numbers = [...voices.keys()].sort((a, b) => a - b)
    if (numbers.length > 2) warn(`${numbers.length} voices, only the first two kept`)
    const voiceList: Voice[] = numbers
      .slice(0, 2)
      .map((k) => ({ stem: k === 1 ? 'up' : 'down', items: (voices.get(k) as VoiceState).items }))
    bar.parts = { kit: { voices: voiceList } }
    bars.push(ordered(bar))
  }

  const title = opts.title ?? (textOf(partwise, 'movement-title') || opts.id)
  const score: Score = { id: opts.id, title, parts: [{ id: 'kit', kind: 'drumset' }], bars }
  if (opts.source) score.source = opts.source
  return { score: parseScore(score), warnings }
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { id: { type: 'string' }, title: { type: 'string' }, source: { type: 'string' }, out: { type: 'string' } },
  })
  const file = positionals[0]
  if (!file || !values.id) {
    console.error('usage: bun run import <file.musicxml> --id <id> [--title T] [--source S] [--out path]')
    process.exit(2)
  }
  const { score, warnings } = importMusicXml(await Bun.file(file).text(), {
    id: values.id,
    title: values.title,
    source: values.source,
  })
  for (const w of warnings) console.error(w)
  const out = values.out ?? `src/data/scores/${values.id}.json`
  await Bun.write(out, `${JSON.stringify(score, null, 2)}\n`)
  console.log(`${out}: ${score.bars.length} bars${warnings.length ? `, ${warnings.length} warnings` : ''}`)
}
