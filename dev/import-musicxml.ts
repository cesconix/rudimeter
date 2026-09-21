// Dev tool: a MusicXML file (written in MuseScore) → one JSON score under src/data/scores/. The app
// bundles the JSON and never sees XML. Partwise files only, first part only, voice 1 only: a pad
// piece has one voice and one stroke at a time, so a second voice or a chord is an error, not a
// warning; every note is a stroke on the snare, whatever MuseScore calls it; marks the model has no
// place for (dynamics, wedges, tempo marks, endings, noteheads…) are dropped with a warning.

import { parseArgs } from 'node:util'
import { XMLParser } from 'fast-xml-parser'
import type { Bar, Dots, Event, Hand, Item, Meter, NoteBase, Roll, Score, TupletGroup } from '../src/score/types'
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
/** MuseScore's names for the snare; any other name is read as a stroke, with a warning. */
const SNARE = /snare/i
/** Notations we read or knowingly skip; anything else is worth a warning. */
const KNOWN_NOTATIONS = new Set(['tied', 'tuplet', 'articulations', 'technical', 'ornaments'])
/** Measure children read by a pass of their own before the music walk; the rest are handled there or warned about. */
const KNOWN_MEASURE_CHILDREN = new Set(['attributes', 'barline', 'print'])

type Warn = (message: string) => void

/** A pad piece has one instrument. A note MuseScore names something else — a tom, a cymbal — is still a stroke, said out loud. */
function checkInstrument(n: XNode, names: Map<string, string>, warn: Warn): void {
  const ref = child(n, 'instrument')
  const name = ref ? (names.get(attrs(ref).id) ?? '') : ''
  if (name && !SNARE.test(name)) warn(`instrument "${name}" read as a stroke`)
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

/** Bar keys in reading order, so the JSON reads like the type. */
function ordered(bar: Bar): Bar {
  const out: Partial<Bar> = {}
  for (const k of ['meter', 'beams', 'repeat', 'newRow', 'items'] as const)
    if (bar[k] !== undefined) Object.assign(out, { [k]: bar[k] })
  return out as Bar
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
  for (const m of children(part, 'measure')) {
    const number = attrs(m).number ?? String(bars.length + 1)
    const warn: Warn = (message) => {
      const line = `measure ${number}: ${message}`
      // Once per measure and message: nine "<notehead> ignored" on nine notes would bury the one line that matters.
      if (!warnings.includes(line)) warnings.push(line)
    }
    const fail = (message: string): never => {
      throw new Error(`measure ${number}: ${message}`)
    }
    const bar: Bar = { items: [] }

    for (const a of children(m, 'attributes')) {
      const t = child(a, 'time')
      if (t) {
        const next: Meter = [Number(textOf(t, 'beats')), Number(textOf(t, 'beat-type'))]
        if (!meter || next[0] !== meter[0] || next[1] !== meter[1]) bar.meter = next
        meter = next
      }
      // A measure-repeat ("%") has no notes of its own: the bar comes out empty and `parseScore` refuses it by name.
      if (has(a, 'measure-style')) warn('<measure-style> ignored')
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
      if (has(bl, 'ending')) warn('<ending> ignored')
    }

    const items: Item[] = []
    let open: TupletGroup | null = null
    let graces = 0
    let pendingText: string | undefined
    for (const el of kids(m)) {
      const tag = tagOf(el)
      if (tag === 'backup' || tag === 'forward') {
        // Nothing in the model stands for a jump in time: a <forward> leaves the bar short and
        // `parseScore` refuses it; a <backup> precedes a second voice, which the next note refuses.
        warn(`<${tag}> of ${textOf(el, 'duration')} divisions ignored`)
        continue
      }
      if (tag === 'sound') {
        if (attrs(el).tempo) warn('<sound tempo> ignored')
        continue
      }
      if (tag === 'direction') {
        for (const dt of children(el, 'direction-type')) {
          for (const mark of ['dynamics', 'wedge', 'metronome']) if (has(dt, mark)) warn(`<${mark}> ignored`)
          const words = child(dt, 'words')
          if (words) pendingText = text(words)
        }
        const sound = child(el, 'sound')
        if (sound && attrs(sound).tempo) warn('<sound tempo> ignored')
        continue
      }
      if (tag !== 'note') {
        if (!KNOWN_MEASURE_CHILDREN.has(tag)) warn(`<${tag}> ignored`)
        continue
      }
      const voiceNo = Number(textOf(el, 'voice') || '1')
      if (voiceNo !== 1) fail(`a note in voice ${voiceNo}: a pad piece has one voice`)
      if (has(el, 'chord')) fail('a chord: a pad piece has one stroke at a time')
      if (has(el, 'grace')) {
        graces++
        continue
      }
      const rest = has(el, 'rest')
      if (!rest) checkInstrument(el, names, warn)
      const base = TYPES[textOf(el, 'type')]
      if (!base) {
        warn(`note type "${textOf(el, 'type')}" unsupported, skipped`)
        continue
      }
      const dots = children(el, 'dot').length as Dots
      const e: Event = { duration: dots ? { base, dots } : { base } }
      if (rest) e.rest = true
      if (attrs(el)['print-object'] === 'no') warn('print-object="no" ignored: the model has no hidden rest')
      let tie = false
      let accent = false
      let roll: Roll | undefined
      let tupletStop = false
      for (const nt of children(el, 'notations')) {
        if (children(nt, 'tied').some((t) => attrs(t).type === 'start')) tie = true
        const art = child(nt, 'articulations')
        if (art && (has(art, 'accent') || has(art, 'strong-accent'))) accent = true
        const tech = child(nt, 'technical')
        if (tech) for (const k of kids(tech)) if (tagOf(k) !== 'fingering') warn(`<${tagOf(k)}> ignored`)
        const orn = child(nt, 'ornaments')
        const tr = orn && child(orn, 'tremolo')
        if (tr) {
          const slashes = Math.min(3, Math.max(1, Number(text(tr)) || 1)) as 1 | 2 | 3
          roll = attrs(tr).type === 'unmeasured' ? { kind: 'buzz' } : { kind: 'tremolo', slashes }
        }
        if (children(nt, 'tuplet').some((t) => attrs(t).type === 'stop')) tupletStop = true
        for (const k of kids(nt)) if (!KNOWN_NOTATIONS.has(tagOf(k))) warn(`<${tagOf(k)}> ignored`)
      }
      if (has(el, 'notehead')) warn('<notehead> ignored')
      // Keys in the order of `Event` in types.ts, so the JSON reads like the type.
      if (accent) e.accent = true
      const hand = handOf(el)
      if (hand) e.sticking = hand
      if (graces > 0) {
        if (graces > 2) warn(`${graces} grace notes, kept as a drag`)
        e.grace = { kind: graces === 1 ? 'flam' : 'drag' }
        graces = 0
      }
      if (roll) e.roll = roll
      if (tie) e.tie = true
      if (pendingText !== undefined) {
        e.text = pendingText
        pendingText = undefined
      }
      const beam = children(el, 'beam').find((b) => (attrs(b).number ?? '1') === '1')
      const mark = beam ? text(beam) : ''
      if (mark === 'begin' || mark === 'continue' || mark === 'end') e.beam = mark
      const tm = child(el, 'time-modification')
      if (tm && !open) {
        open = {
          tuplet: { actual: Number(textOf(tm, 'actual-notes')), normal: Number(textOf(tm, 'normal-notes')) },
          items: [],
        }
        items.push(open)
      } else if (!tm && open) open = null
      if (open) open.items.push(e)
      else items.push(e)
      if (tupletStop) open = null
    }
    if (graces > 0) warn(`${graces} grace note(s) before the bar line dropped`)
    if (pendingText !== undefined) warn(`text "${pendingText}" with no note after it dropped`)
    bar.items = items
    bars.push(ordered(bar))
  }

  const title = opts.title ?? (textOf(partwise, 'movement-title') || opts.id)
  const score: Score = { id: opts.id, title, ...(opts.source ? { source: opts.source } : {}), bars }
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
