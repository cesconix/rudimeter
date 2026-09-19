import { describe, expect, it } from 'bun:test'
import type { Bar, Event, Score } from './types'
import { parseScore, validate } from './validate'

const snare = (base: 4 | 8 | 16 = 4, extra: Partial<Event> = {}): Event => ({
  duration: { base },
  notes: [{ instrument: 'snare' }],
  ...extra,
})
const rest = (base: 4 | 8 | 16 = 4, extra: Partial<Event> = {}): Event => ({ duration: { base }, rest: true, ...extra })
const kick = (base: 4 | 8 = 4): Event => ({ duration: { base }, notes: [{ instrument: 'kick' }] })

/** A valid 2/4 piece: one bar, hands and feet. Every test breaks one thing in a copy of it. */
function valid(): Score {
  return {
    id: 'valid',
    title: 'Valid',
    parts: [{ id: 'kit', kind: 'drumset' }],
    bars: [
      {
        meter: [2, 4],
        parts: {
          kit: {
            voices: [
              { stem: 'up', items: [snare(), snare(8), snare(8)] },
              { stem: 'down', items: [kick(), { duration: { base: 4 }, rest: true, hidden: true }] },
            ],
          },
        },
      },
    ],
  }
}
const withBars = (...bars: Bar[]): Score => ({ ...valid(), bars })
const twoFour = (items: Event[]): Bar => ({ meter: [2, 4], parts: { kit: { voices: [{ stem: 'up', items }] } } })
const paths = (s: Score) => validate(s).map((p) => p.path)

describe('validate', () => {
  it('accepts the fixture', () => {
    expect(validate(valid())).toEqual([])
  })

  it('checks ids', () => {
    expect(paths({ ...valid(), id: 'Not Valid' })).toEqual(['id'])
    expect(paths({ ...valid(), parts: [{ id: 'a/b', kind: 'drumset' }] })).toContain('parts[0].id')
    // No parts at all: `kit` in the bar becomes an unknown part.
    expect(paths({ ...valid(), parts: [] })).toEqual(['parts', 'bars[0].parts.kit'])
    const dup = valid()
    dup.parts = [dup.parts[0], { ...dup.parts[0] }]
    expect(paths(dup)).toContain('parts[1].id')
  })

  it('checks the meter and the first bar', () => {
    expect(paths({ ...valid(), bars: [] })).toEqual(['bars'])
    const noMeter = valid()
    delete noMeter.bars[0].meter
    expect(paths(noMeter)).toEqual(['bars[0].meter'])
    expect(paths(withBars({ ...twoFour([snare(), snare()]), meter: [3, 6] }))).toEqual(['bars[0].meter'])
    expect(paths(withBars({ ...twoFour([snare(), snare()]), meter: [0, 4] }))).toContain('bars[0].meter')
    expect(paths(withBars({ meter: [2, 4], simile: true }))).toEqual(['bars[0].simile'])
    expect(paths(withBars({ ...twoFour([snare(), snare()]), beams: [1, 2] }))).toEqual(['bars[0].beams'])
  })

  it('checks that every voice fills the bar', () => {
    expect(paths(withBars(twoFour([snare()])))).toEqual(['bars[0].parts.kit.voices[0]'])
    expect(validate(withBars(twoFour([snare(), snare(), snare(8)])))[0].message).toBe('sums to 5/8, the bar is 1/2')
    const triplet: Event[] = [{ duration: { base: 8 }, notes: [{ instrument: 'snare' }] }]
    expect(
      paths(
        withBars(
          twoFour([
            snare(),
            { tuplet: { actual: 3, normal: 2 }, items: [...triplet, ...triplet, ...triplet] } as never,
          ]),
        ),
      ),
    ).toEqual([])
  })

  it('checks the parts of every bar', () => {
    expect(paths(withBars({ meter: [2, 4], parts: {} }))).toEqual(['bars[0].parts.kit'])
    expect(paths(withBars({ meter: [2, 4], parts: { kit: { voices: [] } } }))).toEqual(['bars[0].parts.kit.voices'])
    const three = twoFour([snare(), snare()])
    three.parts?.kit.voices.push({ stem: 'down', items: [kick(), kick()] }, { stem: 'down', items: [kick(), kick()] })
    expect(paths(withBars(three))).toEqual(['bars[0].parts.kit.voices'])
    expect(
      paths(
        withBars({
          ...twoFour([snare(), snare()]),
          parts: { ...twoFour([snare(), snare()]).parts, other: { voices: [] } },
        }),
      ),
    ).toEqual(['bars[0].parts.other'])
    expect(paths(withBars(twoFour([snare(), snare()]), { simile: true, parts: {} }))).toEqual(['bars[1].parts'])
  })

  it('checks rests and notes', () => {
    expect(paths(withBars(twoFour([rest(4, { notes: [{ instrument: 'snare' }] }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].notes',
    ])
    expect(paths(withBars(twoFour([rest(4, { accent: true }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0]',
    ])
    expect(paths(withBars(twoFour([snare(4, { hidden: true }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].hidden',
    ])
    expect(paths(withBars(twoFour([{ duration: { base: 4 }, notes: [] }, snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].notes',
    ])
    expect(
      paths(withBars(twoFour([{ duration: { base: 4 }, notes: [{ instrument: 'gong' as never }] }, snare()]))),
    ).toEqual(['bars[0].parts.kit.voices[0].items[0].notes[0].instrument'])
    expect(
      paths(
        withBars(
          twoFour([{ duration: { base: 4 }, notes: [{ instrument: 'snare' }, { instrument: 'snare' }] }, snare()]),
        ),
      ),
    ).toEqual(['bars[0].parts.kit.voices[0].items[0].notes[1].instrument'])
    expect(
      paths(
        withBars(
          twoFour([{ duration: { base: 4 }, notes: [{ instrument: 'hihat', open: true, closed: true }] }, snare()]),
        ),
      ),
    ).toEqual(['bars[0].parts.kit.voices[0].items[0].notes[0]'])
    expect(paths(withBars(twoFour([snare(4, { duration: { base: 3 as never } }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].duration.base',
    ])
    expect(paths(withBars(twoFour([snare(4, { roll: { kind: 'tremolo', slashes: 4 as never } }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].roll.slashes',
    ])
    expect(
      paths(withBars(twoFour([snare(4, { grace: { kind: 'flam', instrument: 'gong' as never } }), snare()]))),
    ).toEqual(['bars[0].parts.kit.voices[0].items[0].grace.instrument'])
  })

  it('checks tuplets', () => {
    const bad = { tuplet: { actual: 0, normal: 2 }, items: [snare(8), snare(8), snare(8)] }
    expect(paths(withBars(twoFour([snare(), bad as never])))).toEqual(['bars[0].parts.kit.voices[0].items[1].tuplet'])
    const nested = {
      tuplet: { actual: 3, normal: 2 },
      items: [snare(8), snare(8), { tuplet: { actual: 3, normal: 2 }, items: [] }],
    }
    expect(paths(withBars(twoFour([snare(), nested as never])))).toEqual([
      'bars[0].parts.kit.voices[0].items[1].items[2]',
    ])
  })

  it('checks ties, hairpins and explicit beams along the voice', () => {
    const tied = twoFour([{ duration: { base: 4 }, notes: [{ instrument: 'snare', tie: true }] }, kick()])
    expect(paths(withBars(tied))).toEqual(['bars[0].parts.kit.voices[0].items[0].notes[0].tie'])
    const tiedAcross = withBars(
      twoFour([snare(), { duration: { base: 4 }, notes: [{ instrument: 'snare', tie: true }] }]),
      twoFour([snare(), snare()]),
    )
    expect(paths(tiedAcross)).toEqual([])
    const tiedIntoRest = withBars(
      twoFour([snare(), { duration: { base: 4 }, notes: [{ instrument: 'snare', tie: true }] }]),
      twoFour([rest(), snare()]),
    )
    expect(paths(tiedIntoRest)).toEqual(['bars[0].parts.kit.voices[0].items[1].notes[0].tie'])
    expect(paths(withBars(twoFour([snare(4, { hairpin: 'cresc' }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].hairpin',
    ])
    expect(paths(withBars(twoFour([snare(4, { hairpin: 'stop' }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].hairpin',
    ])
    expect(paths(withBars(twoFour([snare(4, { hairpin: 'cresc' }), snare(4, { hairpin: 'dim' })])))).toEqual([
      'bars[0].parts.kit.voices[0].items[1].hairpin',
    ])
    expect(paths(withBars(twoFour([snare(4, { hairpin: 'cresc' }), snare(4, { hairpin: 'stop' })])))).toEqual([])
    // The unmarked eighth is reported as the voice goes; the beam left open is reported on the event that began it.
    expect(paths(withBars(twoFour([snare(8, { beam: 'begin' }), snare(8), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[1].beam',
      'bars[0].parts.kit.voices[0].items[0].beam',
    ])
    expect(paths(withBars(twoFour([snare(8, { beam: 'end' }), snare(8, { beam: 'begin' }), snare()])))).toEqual([
      'bars[0].parts.kit.voices[0].items[0].beam',
      'bars[0].parts.kit.voices[0].items[1].beam',
    ])
    expect(
      paths(withBars(twoFour([snare(8, { beam: 'begin' }), snare(8, { beam: 'end' }), snare(4, { beam: 'begin' })]))),
    ).toEqual(['bars[0].parts.kit.voices[0].items[2].beam'])
  })

  it('checks repeats and endings', () => {
    const b = () => twoFour([snare(), snare()])
    expect(paths(withBars({ ...b(), repeat: { start: true } }, { ...b(), repeat: { start: true } }))).toEqual([
      'bars[1].repeat.start',
    ])
    expect(paths(withBars({ ...b(), repeat: { end: { times: 1 } } }))).toEqual(['bars[0].repeat.end.times'])
    expect(paths(withBars({ ...b(), ending: [1] }))).toEqual(['bars[0].ending'])
    expect(paths(withBars({ ...b(), repeat: { start: true } }, { ...b(), ending: [0], repeat: { end: {} } }))).toEqual([
      'bars[1].ending',
    ])
    expect(paths(withBars({ ...b(), repeat: { start: true } }, { ...b(), ending: [3], repeat: { end: {} } }))).toEqual([
      'bars[1].ending',
    ])
    expect(
      paths(
        withBars(
          { ...b(), repeat: { start: true } },
          { ...b(), ending: [1], repeat: { end: {} } },
          { ...b(), ending: [2] },
        ),
      ),
    ).toEqual([])
    expect(
      paths(
        withBars({ ...b(), repeat: { start: true } }, { ...b(), ending: [1], repeat: { end: {} } }, b(), {
          ...b(),
          ending: [2],
        }),
      ),
    ).toEqual(['bars[3].ending'])
  })

  it('checks the tempo', () => {
    expect(paths(withBars({ ...twoFour([snare(), snare()]), tempo: { bpm: 0 } }))).toEqual(['bars[0].tempo.bpm'])
    expect(paths(withBars({ ...twoFour([snare(), snare()]), tempo: { bpm: 100, unit: 3 as never } }))).toEqual([
      'bars[0].tempo.unit',
    ])
  })
})

describe('parseScore', () => {
  it('returns the score when it is valid', () => {
    const s = valid()
    expect(parseScore(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
  it('refuses what is not a score object', () => {
    expect(() => parseScore(null)).toThrow('not a score')
    expect(() => parseScore({ id: 'x' })).toThrow('not a score')
  })
  it('names every problem', () => {
    const s = valid()
    s.id = 'Bad Id'
    s.bars[0].tempo = { bpm: -1 }
    expect(() => parseScore(s)).toThrow('Bad Id: id: must match [a-z0-9-]+; bars[0].tempo.bpm: must be positive')
  })
  it('turns a crash on a malformed bar into a named error', () => {
    const s = valid() as unknown as { bars: unknown[] }
    s.bars[0] = { meter: [2, 4], parts: { kit: { voices: [null] } } }
    expect(() => parseScore(s)).toThrow('valid: malformed score')
  })
})
