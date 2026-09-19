import { describe, expect, it } from 'bun:test'
import kitEndingJson from '../src/data/scores/kit-ending.json'
import type { Item, Score } from '../src/score/types'
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

  it('refuses what is not partwise MusicXML and reports what does not validate', async () => {
    expect(() => importMusicXml('<score-timewise/>', { id: 'x' })).toThrow('not a partwise MusicXML file')
    const short = (await fixture('spellings')).replace(
      '<duration>24</duration><voice>1</voice><type>quarter</type><notehead>diamond',
      '<duration>12</duration><voice>1</voice><type>eighth</type><notehead>diamond',
    )
    expect(() => importMusicXml(short, { id: 'x' })).toThrow('x: bars[0].parts.kit.voices[0]')
  })
})
