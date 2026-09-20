// The gallery's scores: one small piece per row of the spec's coverage table, each isolating what
// its title promises, with the sentence a reviewer checks it against. Built through `parseScore`,
// so a figure that does not validate fails `gallery-scores.test.ts`, not the page.
import type { Bar, Event, InstrumentId, Item, NoteBase, Score } from '../src/score/types'
import { parseScore } from '../src/score/validate'

export interface Figure {
  id: string
  title: string
  /** what the section must show, in the reviewer's words */
  expect: string
  score: Score
}

const on = (ids: InstrumentId | InstrumentId[]) =>
  (Array.isArray(ids) ? ids : [ids]).map((instrument) => ({ instrument }))

/** A sounding event: `N(8)` a snare eighth, `N(8, ['hihat', 'snare'], { accent: true })` a chord. */
const N = (base: NoteBase, ids: InstrumentId | InstrumentId[] = 'snare', extra: Partial<Event> = {}): Event => ({
  duration: { base },
  notes: on(ids),
  ...extra,
})
/** A dotted sounding event. */
const D = (
  base: NoteBase,
  dots: 1 | 2,
  ids: InstrumentId | InstrumentId[] = 'snare',
  extra: Partial<Event> = {},
): Event => ({
  duration: { base, dots },
  notes: on(ids),
  ...extra,
})
const R = (base: NoteBase, dots?: 1 | 2, extra: Partial<Event> = {}): Event => ({
  duration: dots ? { base, dots } : { base },
  rest: true,
  ...extra,
})
/** A hidden rest: takes its time, draws nothing. */
const H = (base: NoteBase, dots?: 1 | 2): Event => ({
  duration: dots ? { base, dots } : { base },
  rest: true,
  hidden: true,
})
const T = (actual: number, normal: number, items: Event[]): Item => ({ tuplet: { actual, normal }, items })
/** A bar of the `kit` part: hands up, feet (when given) down. */
const bar = (up: Item[], down?: Item[], extra: Partial<Bar> = {}): Bar => ({
  ...extra,
  parts: {
    kit: {
      voices: down
        ? [
            { stem: 'up', items: up },
            { stem: 'down', items: down },
          ]
        : [{ stem: 'up', items: up }],
    },
  },
})
const q4 = (): Item[] => [N(4), N(4), N(4), N(4)]
const times = <A>(n: number, make: () => A): A[] => Array.from({ length: n }, make)

function figure(id: string, title: string, expect: string, bars: Bar[], extra: Partial<Score> = {}): Figure {
  const first = bars[0]
  const withMeter = first.meter ? bars : [{ meter: [4, 4] as [number, number], ...first }, ...bars.slice(1)]
  return {
    id,
    title,
    expect,
    score: parseScore({ id, title, parts: [{ id: 'kit', kind: 'drumset' }], ...extra, bars: withMeter }),
  }
}

export const GALLERY: Figure[] = [
  figure(
    'values',
    'Values whole → 32nd, dots',
    'A whole, two halves, four quarters, eighths beamed by beat, sixteenths, sixteen thirty-seconds then a half; a dotted half + quarter; dotted quarter + eighth twice; dotted eighth + sixteenth four times; a double-dotted quarter + sixteenth + half. Every bar the same width; each note at its instant, so the whole note sits at the bar start with the bar empty after it.',
    [
      bar([N(1)]),
      bar([N(2), N(2)]),
      bar(q4()),
      bar(times(8, () => N(8))),
      bar(times(16, () => N(16))),
      bar([...times(16, () => N(32)), N(2)]),
      bar([D(2, 1), N(4)]),
      bar([D(4, 1), N(8), D(4, 1), N(8)]),
      bar([D(8, 1), N(16), D(8, 1), N(16), D(8, 1), N(16), D(8, 1), N(16)]),
      bar([D(4, 2), N(16), N(2)]),
    ],
  ),
  figure(
    'rests',
    'Rests, one per value, dotted, and hidden rests that take time and draw nothing',
    'A whole rest; a half rest then a half; quarter and quarter rest alternating; eighth + eighth rest four times (no beams: each beat has one note); sixteenths beamed over the sixteenth rest between them; a thirty-second rest opening a group of thirty-seconds; a dotted quarter rest + eighth + half rest. Last bar, two voices: quarters above; kicks on 1 and 3 below with NOTHING printed on 2 and 4.',
    [
      bar([R(1)]),
      bar([R(2), N(2)]),
      bar([N(4), R(4), N(4), R(4)]),
      bar([N(8), R(8), N(8), R(8), N(8), R(8), N(8), R(8)]),
      bar([
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
        N(16),
        R(16),
      ]),
      bar([R(32), ...times(7, () => N(32)), N(2), N(4)]),
      bar([R(4, 1), N(8), R(2)]),
      bar(q4(), [N(4, 'kick'), H(4), N(4, 'kick'), H(4)]),
    ],
  ),
  figure(
    'tuplets',
    'Tuplets: 3:2 eighths, 5:4 / 6:4 / 7:4 sixteenths, a quarter-note triplet, a rest inside a triplet',
    'A plain "3" over each eighth triplet (no ratio), "5", "6", "7" over the sixteenth groups, each group beamed as one unit inside its quarter and never joined to the neighbours; the quarter triplet bracketed with no beam; the rest inside the last triplet keeps its place under the bracket.',
    [
      bar([T(3, 2, [N(8), N(8), N(8)]), N(4), T(3, 2, [N(8), N(8), N(8)]), N(4)]),
      bar([
        T(
          5,
          4,
          times(5, () => N(16)),
        ),
        T(
          6,
          4,
          times(6, () => N(16)),
        ),
        T(
          7,
          4,
          times(7, () => N(16)),
        ),
        N(4),
      ]),
      bar([T(3, 2, [N(4), N(4), N(4)]), N(2)]),
      bar([T(3, 2, [N(8), R(8), N(8)]), N(4), N(8), N(8), T(3, 2, [N(8), N(8), N(8)])]),
    ],
  ),
  figure(
    'voices',
    'Two voices: hands up, feet down, sharing instants',
    'Stems up for the hands, down for the feet. Bar 1: hi-hat eighths with the snare on 2 and 4 as chords; kick on 1 and 3 below, with quarter rests below the middle line on 2 and 4. Bar 2: ride eighths with the bell on 3; kick and hi-hat foot alternating. Bar 3: snare, high tom, mid tom, floor tom going down the staff; two half-note kicks. Bar 4: crash + snare, a rest above the middle line, hi-hat + snare half; a whole-note kick. A kick under a hi-hat eighth sits on the same x.',
    [
      bar(
        [
          N(8, 'hihat'),
          N(8, 'hihat'),
          N(8, ['hihat', 'snare']),
          N(8, 'hihat'),
          N(8, 'hihat'),
          N(8, 'hihat'),
          N(8, ['hihat', 'snare']),
          N(8, 'hihat'),
        ],
        [N(4, 'kick'), R(4), N(4, 'kick'), R(4)],
      ),
      bar(
        [
          N(8, 'ride'),
          N(8, 'ride'),
          N(8, 'ride'),
          N(8, 'ride'),
          N(8, 'ride-bell'),
          N(8, 'ride'),
          N(8, 'ride'),
          N(8, 'ride'),
        ],
        [N(4, 'kick'), N(4, 'hihat-pedal'), N(4, 'kick'), N(4, 'hihat-pedal')],
      ),
      bar([N(4, 'snare'), N(4, 'tom-high'), N(4, 'tom-mid'), N(4, 'tom-floor')], [N(2, 'kick'), N(2, 'kick')]),
      bar([N(4, ['crash', 'snare']), R(4), N(2, ['hihat', 'snare'])], [N(1, 'kick')]),
    ],
  ),
  figure(
    'noteheads',
    'Noteheads from the catalogue and per-note overrides, black and open',
    'Bar 1: snare normal, hi-hat x, ride bell diamond, cross stick x on the snare line. Bar 2: half notes keep an OPEN head — hollow x, hollow diamond. Bar 3, all on the snare line: circle-x, triangle, slash, x. Bar 4: the same four as halves, open where the font has an open variant.',
    [
      bar([N(4, 'snare'), N(4, 'hihat'), N(4, 'ride-bell'), N(4, 'cross-stick')]),
      bar([N(2, 'hihat'), N(2, 'ride-bell')]),
      bar([
        { duration: { base: 4 }, notes: [{ instrument: 'snare', head: 'circle-x' }] },
        { duration: { base: 4 }, notes: [{ instrument: 'snare', head: 'triangle' }] },
        { duration: { base: 4 }, notes: [{ instrument: 'snare', head: 'slash' }] },
        { duration: { base: 4 }, notes: [{ instrument: 'snare', head: 'x' }] },
      ]),
      bar([
        { duration: { base: 2 }, notes: [{ instrument: 'snare', head: 'circle-x' }] },
        { duration: { base: 2 }, notes: [{ instrument: 'snare', head: 'triangle' }] },
      ]),
    ],
  ),
  figure(
    'head',
    'Percussion clef, meter, bar numbers, rows',
    'Three rows of two bars. The percussion clef on every row; "4/4" only on the first; bar numbers 1, 3, 5 in grey above the clef; a thick final barline on the last bar. The three rows have the same width and their first notes sit on the same x.',
    [
      bar(q4()),
      bar(q4()),
      bar(q4(), undefined, { newRow: true }),
      bar(q4()),
      bar(q4(), undefined, { newRow: true }),
      bar(q4()),
    ],
  ),
]
