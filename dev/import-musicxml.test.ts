import { describe, expect, it } from 'bun:test'
import kitEndingJson from '../src/data/scores/kit-ending.json'
import type { Item, Score } from '../src/score/types'
import { validate } from '../src/score/validate'
import { importMusicXml } from './import-musicxml'

// resolveJsonModule widens every string field to `string`, so the JSON import does not satisfy
// `Score` (e.g. `kind: string` vs `kind: 'drumset'`) even though the values are the right literals.
const kitEnding = kitEndingJson as unknown as Score

const fixture = (name: string) => Bun.file(new URL(`./fixtures/musicxml/${name}.musicxml`, import.meta.url)).text()

describe('importMusicXml', () => {
  it('round-trips the kit groove: MuseScore names, two voices, chords, tuplet, ghosts, flam, buzz, dynamics, endings, simile', async () => {
    const { score, warnings } = importMusicXml(await fixture('kit-ending'), { id: 'kit-ending', source: 'study' })
    expect(warnings).toEqual([])
    expect(score).toEqual(kitEnding)
  })

  it('places notes by staff position when there are no instrument names, keeps the spellings and the explicit beams', async () => {
    const { score, warnings } = importMusicXml(await fixture('spellings'), { id: 'spellings' })
    expect(warnings).toEqual(['measure 1: <fermata> ignored', 'measure 2: instrument "?" unknown, written as snare'])
    const hihat = (beam: 'begin' | 'continue' | 'end', closed = false): Item => ({
      duration: { base: 32 },
      notes: [closed ? { instrument: 'hihat', closed: true } : { instrument: 'hihat' }],
      beam,
    })
    expect(score).toEqual({
      id: 'spellings',
      title: 'spellings',
      parts: [{ id: 'kit', kind: 'drumset' }],
      bars: [
        {
          meter: [3, 4],
          tempo: { bpm: 90 },
          parts: {
            kit: {
              voices: [
                {
                  stem: 'up',
                  items: [
                    {
                      duration: { base: 8, dots: 1 },
                      notes: [{ instrument: 'snare', tie: true }],
                      sticking: 'R',
                      beam: 'begin',
                    },
                    { duration: { base: 16 }, notes: [{ instrument: 'snare' }], beam: 'end' },
                    hihat('begin', true),
                    hihat('continue'),
                    hihat('continue'),
                    hihat('continue'),
                    hihat('continue'),
                    hihat('continue'),
                    hihat('continue'),
                    hihat('end'),
                    {
                      duration: { base: 4 },
                      notes: [{ instrument: 'ride-bell' }],
                      roll: { kind: 'tremolo', slashes: 2 },
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          meter: [4, 4],
          parts: {
            kit: {
              voices: [
                {
                  stem: 'up',
                  items: [
                    { duration: { base: 2 }, notes: [{ instrument: 'cross-stick' }] },
                    { duration: { base: 4 }, notes: [{ instrument: 'snare' }] },
                    { duration: { base: 4 }, rest: true },
                  ],
                },
              ],
            },
          },
        },
      ],
    })
  })

  it('gives a bar with no voice 1 a voice of hidden rests, so the feet keep their index', async () => {
    const { score, warnings } = importMusicXml(await fixture('feet-only'), { id: 'feet-only' })
    expect(warnings).toEqual(['measure 2: no voice 1, filled with hidden rests'])
    const kick: Item = { duration: { base: 4 }, notes: [{ instrument: 'kick' }] }
    expect(score.bars[1].parts?.kit.voices).toEqual([
      { stem: 'up', items: [{ duration: { base: 1 }, rest: true, hidden: true }] },
      { stem: 'down', items: [kick, kick, kick, kick] },
    ])
    expect(validate(score)).toEqual([])
  })

  it('keeps a volta bracket open through an ending marked continue', async () => {
    const { score, warnings } = importMusicXml(await fixture('bracket-continue'), { id: 'bracket-continue' })
    expect(warnings).toEqual([])
    expect(score.bars.map((b) => b.ending)).toEqual([undefined, [1], [1], [2]])
    expect(score.bars[2].repeat).toEqual({ end: {} })
    expect(validate(score)).toEqual([])
  })

  it('warns about a <forward> it drops and a <backup> that does not return to the bar start', async () => {
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
    expect(() => importMusicXml(short, { id: 'x' })).toThrow('voices[0]')

    // The backup lands six divisions short of the bar start; the voices are split by <voice>, so
    // the score itself still round-trips.
    const backup = (await fixture('kit-ending')).replace(
      '<backup><duration>96</duration></backup>',
      '<backup><duration>84</duration></backup>',
    )
    const off = importMusicXml(backup, { id: 'kit-ending', source: 'study' })
    expect(off.warnings).toEqual(['measure 1: <backup> of 84 divisions does not return to the bar start (96 consumed)'])
    expect(off.score).toEqual(kitEnding)
  })

  it('warns about a wedge type it cannot map instead of writing an undefined hairpin', async () => {
    const kit = await fixture('kit-ending')
    const unmapped = kit.replace('type="diminuendo"', 'type="continue"')
    const noStop = unmapped.replace(
      '<direction placement="below"><direction-type><wedge type="stop"/></direction-type></direction>',
      '',
    )
    expect(importMusicXml(noStop, { id: 'kit-ending', source: 'study' }).warnings).toEqual([
      'measure 3: wedge "continue" ignored',
    ])
    expect(() => importMusicXml(unmapped, { id: 'kit-ending' })).toThrow('hairpin')
  })

  it('reads a <sound tempo> that is a direct child of the measure', async () => {
    const loose = (await fixture('spellings')).replace(
      '<direction><sound tempo="90"/></direction>',
      '<sound tempo="90"/>',
    )
    expect(importMusicXml(loose, { id: 'spellings' }).score.bars[0].tempo).toEqual({ bpm: 90 })
  })

  it('warns about grace notes left before the bar line', async () => {
    const grace =
      '<note><grace slash="yes"/><unpitched><display-step>A</display-step><display-octave>4</display-octave></unpitched><instrument id="P1-I43"/><voice>1</voice><type>eighth</type></note>'
    const barline =
      '<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward" times="2"/></barline>'
    const dangling = (await fixture('kit-ending')).replace(barline, `${grace}\n      ${barline}`)
    const { score, warnings } = importMusicXml(dangling, { id: 'kit-ending', source: 'study' })
    expect(warnings).toEqual(['measure 2: 1 grace note(s) before the bar line dropped'])
    expect(score).toEqual(kitEnding)
  })

  it('names the measure of an <ending> with no number', async () => {
    const unnumbered = (await fixture('kit-ending')).replace(
      '<ending number="1" type="start"/>',
      '<ending type="start"/>',
    )
    expect(() => importMusicXml(unnumbered, { id: 'kit-ending' })).toThrow('measure 2: <ending> without a number')
  })

  it('refuses what is not partwise MusicXML and reports what does not validate', async () => {
    expect(() => importMusicXml('<score-timewise/>', { id: 'x' })).toThrow('not a partwise MusicXML file')
    const short = (await fixture('spellings')).replace(
      '<duration>24</duration><voice>1</voice><type>quarter</type><notehead>diamond',
      '<duration>12</duration><voice>1</voice><type>eighth</type><notehead>diamond',
    )
    expect(() => importMusicXml(short, { id: 'x' })).toThrow('x: bars[0].parts.kit.voices[0]')
  })
})
