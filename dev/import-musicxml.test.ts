import { describe, expect, it } from 'bun:test'
import type { Event, Score } from '../src/score/types'
import { validate } from '../src/score/validate'
import { importMusicXml } from './import-musicxml'

const fixture = (name: string) => Bun.file(new URL(`./fixtures/musicxml/${name}.musicxml`, import.meta.url)).text()
const eighth = (sticking: 'R' | 'L', beam: 'begin' | 'continue' | 'end'): Event => ({
  duration: { base: 8 },
  sticking,
  beam,
})

/** What `pad-rudiments.musicxml` says, in the model. */
const PAD_RUDIMENTS: Score = {
  id: 'pad-rudiments',
  title: 'Pad rudiments',
  bars: [
    {
      meter: [4, 4],
      repeat: { start: true },
      items: [
        { duration: { base: 4 }, sticking: 'R', grace: { kind: 'flam' }, text: 'Flam tap' },
        { duration: { base: 4 }, sticking: 'L', grace: { kind: 'drag' } },
        { duration: { base: 4 }, sticking: 'R', roll: { kind: 'tremolo', slashes: 2 }, tie: true },
        { duration: { base: 4 }, accent: true, sticking: 'R' },
      ],
    },
    {
      repeat: { end: { times: 3 } },
      items: [
        {
          tuplet: { actual: 3, normal: 2 },
          items: [eighth('R', 'begin'), eighth('L', 'continue'), eighth('R', 'end')],
        },
        { duration: { base: 4 }, rest: true },
        eighth('L', 'begin'),
        eighth('R', 'end'),
        { duration: { base: 4 }, sticking: 'R', roll: { kind: 'buzz' } },
      ],
    },
    {
      meter: [6, 8],
      newRow: true,
      items: [
        eighth('R', 'begin'),
        eighth('L', 'continue'),
        eighth('R', 'end'),
        eighth('L', 'begin'),
        eighth('R', 'continue'),
        eighth('L', 'end'),
      ],
    },
  ],
}

describe('importMusicXml', () => {
  it('round-trips the pad fixture: flam, drag, a roll tied into an accent, a triplet, a text, ×3, a 6/8 bar on a new row', async () => {
    const { score, warnings } = importMusicXml(await fixture('pad-rudiments'), { id: 'pad-rudiments' })
    expect(warnings).toEqual([])
    expect(score).toEqual(PAD_RUDIMENTS)
    expect(validate(score)).toEqual([])
    // Keys in reading order, so the JSON on disk reads like the type.
    expect(Object.keys(score.bars[0])).toEqual(['meter', 'repeat', 'items'])
    expect(Object.keys(score.bars[2])).toEqual(['meter', 'newRow', 'items'])
  })

  it('takes the title from the file unless given, the id from the caller, and a source when given', async () => {
    const xml = await fixture('pad-rudiments')
    expect(importMusicXml(xml, { id: 'x', source: 'PAS, p. 2' }).score).toMatchObject({
      id: 'x',
      title: 'Pad rudiments',
      source: 'PAS, p. 2',
    })
    expect(importMusicXml(xml, { id: 'x', title: 'Mine' }).score.title).toBe('Mine')
    expect(Object.keys(importMusicXml(xml, { id: 'x', source: 's' }).score)).toEqual(['id', 'title', 'source', 'bars'])
  })

  it('refuses a second voice, a chord, and a measure the file leaves empty', async () => {
    const xml = await fixture('pad-rudiments')
    expect(() => importMusicXml(xml.replace('<voice>1</voice>', '<voice>2</voice>'), { id: 'x' })).toThrow(
      'measure 1: a note in voice 2: a pad piece has one voice',
    )
    const chord =
      '<note><chord/><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>24</duration><voice>1</voice><type>quarter</type></note>'
    expect(() =>
      importMusicXml(xml.replace('<measure number="2">', `<measure number="2">${chord}`), { id: 'x' }),
    ).toThrow('measure 2: a chord: a pad piece has one stroke at a time')
    // A measure-repeat bar ("%") has no notes of its own: the model has no simile, so the bar comes out empty and is refused by name.
    const simile = xml.replace(
      /<measure number="3">[\s\S]*?<\/measure>/,
      '<measure number="3"><attributes><measure-style><measure-repeat type="start">1</measure-repeat></measure-style></attributes></measure>',
    )
    expect(() => importMusicXml(simile, { id: 'x' })).toThrow('x: bars[2].items: sums to 0, the bar is 1')
  })

  it('warns, once per measure and message, about what the model has no place for', async () => {
    const xml = await fixture('pad-rudiments')
    const marks =
      '<direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction>' +
      '<direction><direction-type><wedge type="crescendo"/></direction-type></direction>' +
      '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>'
    const marked = xml
      .replace('<measure number="2">', `<measure number="2">${marks}`)
      .replace(
        '<repeat direction="backward" times="3"/>',
        '<ending number="1" type="stop"/><repeat direction="backward" times="3"/>',
      )
    const { score, warnings } = importMusicXml(marked, { id: 'pad-rudiments' })
    expect(warnings).toEqual([
      'measure 2: <ending> ignored',
      'measure 2: <dynamics> ignored',
      'measure 2: <wedge> ignored',
      'measure 2: <metronome> ignored',
      'measure 2: <sound tempo> ignored',
    ])
    expect(score).toEqual(PAD_RUDIMENTS)
    // An instrument that is not the snare is still a stroke, said out loud — once per measure, not per note.
    expect(importMusicXml(xml.replace('Acoustic Snare', 'High Tom'), { id: 'x' }).warnings).toEqual([
      'measure 1: instrument "High Tom" read as a stroke',
      'measure 2: instrument "High Tom" read as a stroke',
      'measure 3: instrument "High Tom" read as a stroke',
    ])
  })

  it('reads a file with no instrument names by position: every note a stroke; noteheads (once per measure), a stopped mark, a tempo and a fermata warn', async () => {
    const { score, warnings } = importMusicXml(await fixture('spellings'), { id: 'spellings' })
    expect(warnings).toEqual([
      'measure 1: <sound tempo> ignored',
      'measure 1: <stopped> ignored',
      'measure 1: <notehead> ignored',
      'measure 1: <fermata> ignored',
      'measure 2: <notehead> ignored',
    ])
    const thirtySecond = (beam: 'begin' | 'continue' | 'end'): Event => ({ duration: { base: 32 }, beam })
    expect(score).toEqual({
      id: 'spellings',
      title: 'spellings',
      bars: [
        {
          meter: [3, 4],
          items: [
            { duration: { base: 8, dots: 1 }, sticking: 'R', tie: true, beam: 'begin' },
            { duration: { base: 16 }, beam: 'end' },
            thirtySecond('begin'),
            thirtySecond('continue'),
            thirtySecond('continue'),
            thirtySecond('continue'),
            thirtySecond('continue'),
            thirtySecond('continue'),
            thirtySecond('continue'),
            thirtySecond('end'),
            { duration: { base: 4 }, roll: { kind: 'tremolo', slashes: 2 } },
          ],
        },
        {
          meter: [4, 4],
          items: [{ duration: { base: 2 } }, { duration: { base: 4 } }, { duration: { base: 4 }, rest: true }],
        },
      ],
    })
  })

  it('warns about a <forward> it drops; the bar that comes out short is refused', async () => {
    const spellings = await fixture('spellings')
    const forward = spellings.replace('<note><rest/>', '<forward><duration>6</duration></forward><note><rest/>')
    expect(importMusicXml(forward, { id: 'spellings' }).warnings).toContain(
      'measure 2: <forward> of 6 divisions ignored',
    )
    // What the dropped <forward> costs: give its six divisions back to the rest and the bar no
    // longer adds up, which is exactly the hole the warning is about.
    const short = forward.replace(
      '<note><rest/><duration>24</duration><voice>1</voice><type>quarter</type></note>',
      '<note><rest/><duration>18</duration><voice>1</voice><type>eighth</type><dot/></note>',
    )
    expect(() => importMusicXml(short, { id: 'x' })).toThrow('x: bars[1].items: sums to 15/16, the bar is 1')
  })

  it('refuses what is not partwise MusicXML', () => {
    expect(() => importMusicXml('<score-timewise/>', { id: 'x' })).toThrow('not a partwise MusicXML file')
  })
})
