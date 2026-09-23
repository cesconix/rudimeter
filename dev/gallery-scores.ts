// The gallery's scores: one small piece per notation of the pad, each isolating what its title
// promises, with the sentence a reviewer checks it against. Built through `parseScore`, so a
// figure that does not validate fails `gallery-scores.test.ts`, not the page.
import type { Bar, Event, Item, NoteBase, Score } from '../src/score/types'
import { parseScore } from '../src/score/validate'

export interface Figure {
  id: string
  title: string
  /** what the section must show, in the reviewer's words */
  expect: string
  score: Score
  /** fixed bars per row, for a figure whose sentence names a barline or a row end; automatic otherwise */
  barsPerRow?: number
}

/** A stroke: `N(8)` an eighth, `N(4, { accent: true, sticking: 'R' })` an accented quarter with its hand. */
const N = (base: NoteBase, extra: Partial<Event> = {}): Event => ({ duration: { base }, ...extra })
/** A dotted stroke. */
const D = (base: NoteBase, dots: 1 | 2, extra: Partial<Event> = {}): Event => ({ duration: { base, dots }, ...extra })
const R = (base: NoteBase, dots?: 1 | 2, extra: Partial<Event> = {}): Event => ({
  duration: dots ? { base, dots } : { base },
  rest: true,
  ...extra,
})
const T = (actual: number, normal: number, items: Event[]): Item => ({ tuplet: { actual, normal }, items })
const bar = (items: Item[], extra: Partial<Bar> = {}): Bar => ({ ...extra, items })
const q4 = (): Item[] => [N(4), N(4), N(4), N(4)]
const times = <A>(n: number, make: (i: number) => A): A[] => Array.from({ length: n }, (_, i) => make(i))
const hand = (i: number): 'R' | 'L' => (i % 2 === 0 ? 'R' : 'L')

function figure(id: string, title: string, expect: string, bars: Bar[], barsPerRow?: number): Figure {
  const first = bars[0]
  const withMeter = first.meter ? bars : [{ meter: [4, 4] as [number, number], ...first }, ...bars.slice(1)]
  const fig: Figure = { id, title, expect, score: parseScore({ id, title, bars: withMeter }) }
  if (barsPerRow !== undefined) fig.barsPerRow = barsPerRow
  return fig
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
    'Rests, one per value, dotted, inside a beamed group',
    'A whole rest; a half rest then a half; quarter and quarter rest alternating; eighth + eighth rest four times (no beams: each beat has one note); sixteenths beamed over the sixteenth rest between them; a thirty-second rest opening a group of thirty-seconds; a dotted quarter rest + eighth + half rest. The whole rest hangs from the fourth line; every other rest is on the middle line, the ones under a beam included — both sixteenth rests of a beat at the same height.',
    [
      bar([R(1)]),
      bar([R(2), N(2)]),
      bar([N(4), R(4), N(4), R(4)]),
      bar([N(8), R(8), N(8), R(8), N(8), R(8), N(8), R(8)]),
      bar(times(16, (i) => (i % 2 === 0 ? N(16) : R(16)))),
      bar([R(32), ...times(7, () => N(32)), N(2), N(4)]),
      bar([R(4, 1), N(8), R(2)]),
    ],
  ),
  figure(
    'tuplets',
    'Tuplets: 3:2 eighths, 5:4 / 6:4 / 7:4 sixteenths, a quarter-note triplet, a rest inside a triplet',
    'A plain "3" over each eighth triplet (no ratio), "5", "6", "7" over the sixteenth groups, each group beamed as one unit inside its quarter and never joined to the neighbours; the quarter triplet bracketed with no beam; the rest inside the last triplet stays on the middle line under the bracket; a sextuplet of eighths spanning two beats, one bracket and one beam over the six.',
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
      bar([
        T(
          6,
          4,
          times(6, () => N(8)),
        ),
        N(4),
        N(4),
      ]),
    ],
  ),
  figure(
    'head',
    'Percussion clef, meter, bar numbers, rows',
    'Three rows of two bars. The percussion clef on every row; "4/4" only on the first; bar numbers 1, 3, 5 in grey above the clef; a thick final barline on the last bar. The three rows end on the same right edge; the first row\'s music starts after the "4/4", the other two right after the clef.',
    [bar(q4()), bar(q4()), bar(q4(), { newRow: true }), bar(q4()), bar(q4(), { newRow: true }), bar(q4())],
  ),
  figure(
    'accents',
    'Accents above the note, on beamed eighths, a quarter and a half',
    'Bar 1: a ">" above the first eighth of each beat pair (over the beam, not under it) and above the accented quarter. Bar 2: a ">" above an accented half. Never below the staff.',
    [
      bar([N(8, { accent: true }), N(8), N(8, { accent: true }), N(8), N(4, { accent: true }), N(4)]),
      bar([N(2, { accent: true }), N(2)]),
    ],
  ),
  figure(
    'grace',
    'Flam and drag: grace notes before the note; room for them on a downbeat',
    'Bar 1: a slashed grace eighth before the first quarter (flam), two beamed grace sixteenths before the second (drag), a flam with the sticking R under the main note, a plain quarter; the first flam sits after the "4/4". Bar 2, mid-row: a flam on beat 1, after the barline, not across it. Bars 3 and 4 open with a drag on beat 1, at a row start and mid-row: both grace notes clear of the clef and of the barline.',
    [
      bar([
        N(4, { grace: { kind: 'flam' } }),
        N(4, { grace: { kind: 'drag' } }),
        N(4, { grace: { kind: 'flam' }, sticking: 'R' }),
        N(4),
      ]),
      bar([N(4, { grace: { kind: 'flam' } }), N(4), N(4), N(4)]),
      bar([N(4, { grace: { kind: 'drag' } }), N(4), N(4), N(4)]),
      bar([N(4, { grace: { kind: 'drag' } }), N(4), N(4), N(4)]),
    ],
    2,
  ),
  figure(
    'rolls',
    'Rolls: one, two, three tremolo slashes, a buzz; on a half, with an accent, on a flam (a cheese)',
    'Bar 1: quarters with 1, 2 and 3 slashes across the stem, then the buzz "z" on the stem. Bar 2: a half note with two slashes, an accented buzz quarter (accent above the z), and a flam with one slash — a cheese: the grace note before, the slash on the stem.',
    [
      bar([
        N(4, { roll: { kind: 'tremolo', slashes: 1 } }),
        N(4, { roll: { kind: 'tremolo', slashes: 2 } }),
        N(4, { roll: { kind: 'tremolo', slashes: 3 } }),
        N(4, { roll: { kind: 'buzz' } }),
      ]),
      bar([
        N(2, { roll: { kind: 'tremolo', slashes: 2 } }),
        N(4, { roll: { kind: 'buzz' }, accent: true }),
        N(4, { grace: { kind: 'flam' }, roll: { kind: 'tremolo', slashes: 1 } }),
      ]),
    ],
  ),
  figure(
    'sticking',
    'Sticking under the staff: a paradiddle; under a flam and under a rolled note',
    'Bar 1: R L R R L R L L under the eighths, one letter under each head, the accents above the first of each group; the letters are on one line, none drops lower than its neighbour. Bar 2: R under a flam, L under a quarter with one slash, R L under two plain quarters — always below the staff.',
    [
      bar([
        N(8, { accent: true, sticking: 'R' }),
        N(8, { sticking: 'L' }),
        N(8, { sticking: 'R' }),
        N(8, { sticking: 'R' }),
        N(8, { accent: true, sticking: 'L' }),
        N(8, { sticking: 'R' }),
        N(8, { sticking: 'L' }),
        N(8, { sticking: 'L' }),
      ]),
      bar([
        N(4, { grace: { kind: 'flam' }, sticking: 'R' }),
        N(4, { roll: { kind: 'tremolo', slashes: 1 }, sticking: 'L' }),
        N(4, { sticking: 'R' }),
        N(4, { sticking: 'L' }),
      ]),
    ],
  ),
  figure(
    'ties',
    'Ties: inside a bar, across a bar, across a row end; a five-stroke roll',
    'Bar 1: quarter tied to quarter, then two quarters. Bar 2 ends on a quarter tied into bar 3: the tie crosses the barline. Bar 3 ends on a half tied into bar 4, which starts a new row: a half tie leaves the first row to the right edge and a half tie enters the second row from the left. Bar 4: the half the tie enters, then a quarter with two slashes tied to an accented quarter — a five-stroke roll as the books write it. (four bars per row, fixed, so the barline and the row end fall where the sentence says at every width).',
    [
      bar([N(4, { tie: true }), N(4), N(4), N(4)]),
      bar([N(4), N(4), N(4), N(4, { tie: true })]),
      bar([N(4), N(4), N(2, { tie: true })]),
      bar([N(2), N(4, { roll: { kind: 'tremolo', slashes: 2 }, tie: true }), N(4, { accent: true })], { newRow: true }),
    ],
    4,
  ),
  figure(
    'text',
    'Text above the note, above an accent, above a tuplet number, above a rest',
    '"Flam tap" above beat 1 and "Fill" above beat 3, above the stems; on beat 3 the note is accented and the text sits above the accent. Bar 2 opens with an eighth triplet whose first note carries "Roll": it sits under the bracket, between the 3 and the beam, clear of both; then a quarter rest with "Rest" above it, above the middle line; two quarters.',
    [
      bar([N(4, { text: 'Flam tap' }), N(4), N(4, { text: 'Fill', accent: true }), N(4)]),
      bar([T(3, 2, [N(8, { text: 'Roll' }), N(8), N(8)]), R(4, undefined, { text: 'Rest' }), N(4), N(4)]),
    ],
  ),
  figure(
    'repeats',
    'Repeats drawn out: a section twice, a section three times, an end with no start, a return to another meter',
    'Sixteen drawn bars, four per row, numbered as drawn — 1, 5, 9, 13 at the row starts — with no repeat sign and no "×N" anywhere. Bars 1–4: a bar of quarters then a bar of eighths, drawn twice (quarters, eighths, quarters, eighths). Bars 5–10: a 3/4 section, three quarters then a dotted half, drawn three times; the "3/4" prints once, on bar 5, and the returns to it on bars 7 and 9 print nothing, bar 9 starting its row with the clef alone. Bars 11–12: a whole note with an end sign and no start — the section since the previous end — drawn twice; the "4/4" prints on bar 11 alone. Bars 13–16: a 6/8 bar of six eighths then a 4/4 bar of quarters, drawn twice: all four print their signature, each differing from the drawn bar before it. Every barline is plain; bar 16, the last, ends with the thick final barline.',
    [
      bar(q4(), { repeat: { start: true } }),
      bar(
        times(8, () => N(8)),
        { repeat: { end: {} } },
      ),
      bar([N(4), N(4), N(4)], { meter: [3, 4], repeat: { start: true } }),
      bar([D(2, 1)], { repeat: { end: { times: 3 } } }),
      bar([N(1)], { meter: [4, 4], repeat: { end: { times: 2 } } }),
      bar(
        times(6, () => N(8)),
        { meter: [6, 8], repeat: { start: true } },
      ),
      bar(q4(), { meter: [4, 4], repeat: { end: {} } }),
    ],
    4,
  ),
  figure(
    'meters',
    'Meter changes: 4/4, 3/4, 6/8, 7/8 (2+2+3 and 3+2+2), 2/4, 12/8 at a row start, back to 4/4',
    'Bar 1 in 4/4; "3/4" drawn before three quarters (the bar is three quarters wide); "6/8" before six eighths beamed 3+3; "7/8" before seven eighths beamed 2+2+3; then seven eighths beamed 3+2+2 with no new signature (explicit groups); "2/4" before two quarters; "12/8" at a row start before twelve eighths beamed in threes, four groups; then "4/4" again. Every signature that is not the first of a row sits in its own gutter before the bar\'s first note.',
    [
      bar(q4()),
      bar([N(4), N(4), N(4)], { meter: [3, 4] }),
      bar(
        times(6, () => N(8)),
        { meter: [6, 8] },
      ),
      bar(
        times(7, () => N(8)),
        { meter: [7, 8] },
      ),
      bar(
        times(7, () => N(8)),
        { beams: [3, 2, 2] },
      ),
      bar([N(4), N(4)], { meter: [2, 4] }),
      bar(
        times(12, () => N(8)),
        { meter: [12, 8], newRow: true },
      ),
      bar(q4(), { meter: [4, 4] }),
    ],
    2,
  ),
]

/**
 * Everything the band must hold at once, on a pad, stacked on as many strokes as validation allows:
 * above — texts over accents over drags and flams, tuplet numbers over triplets, quintuplets,
 * sextuplets and septuplets of sixteenths and thirty-seconds, three slashes on beamed stems, buzzes,
 * and the tallest stack of all, a text over an accented 32nd under a bracket;
 * below — sticking under every kind of note, ties, beamed rests. Two rows of two bars, a 12/8 change
 * and a tie across the row break, stacked as the app stacks them: "Measure band" checks that its band
 * (`rowBand`) holds each row, and how much air is left under the letters.
 */
const full = (base: NoteBase, h: 'R' | 'L', extra: Partial<Event> = {}): Event =>
  N(base, { accent: true, sticking: h, ...extra })
const drag = { grace: { kind: 'drag' } } as const
const flam = { grace: { kind: 'flam' } } as const
const slashes = (n: 1 | 2 | 3) => ({ roll: { kind: 'tremolo', slashes: n } }) as const
const buzz = { roll: { kind: 'buzz' } } as const

export const WORST_CASE: Figure = figure(
  'worst-case',
  'Worst case for the band',
  'Four bars on two rows, every mark of the pad on as many strokes as it fits: nothing drawn above the top of the band or below its bottom, so no row reaches the next, and the letters closer to their own staff than to the next row. The Measurements block prints the overflow, if any.',
  [
    bar([
      T(3, 2, [
        full(16, 'R', { ...drag, ...slashes(3), text: 'Flam accent' }),
        full(16, 'L', flam),
        full(16, 'R', buzz),
      ]),
      T(
        5,
        4,
        times(5, (i) => full(32, hand(i), i === 0 ? { ...drag, text: 'Five' } : {})),
      ),
      ...times(8, (i) => full(32, hand(i), i === 0 ? { ...flam, text: 'Rip' } : {})),
      D(8, 1, { accent: true, sticking: 'R', ...drag, ...slashes(3), tie: true }),
      full(16, 'R', flam),
      T(
        6,
        4,
        times(6, (i) => full(16, hand(i), i === 0 ? { ...drag, ...slashes(2), text: 'Six' } : {})),
      ),
    ]),
    bar([
      R(16, undefined, { text: 'Fill' }),
      full(16, 'R', flam),
      full(8, 'L', { ...drag, ...buzz }),
      T(3, 2, [full(8, 'R', { ...flam, text: 'Flam accent' }), full(8, 'L', slashes(3)), full(8, 'R', drag)]),
      full(4, 'R', { ...drag, ...buzz, text: 'Buzz' }),
      D(8, 2, { accent: true, sticking: 'L', ...drag, ...slashes(3) }),
      full(32, 'R', { tie: true }),
    ]),
    bar(
      [
        full(8, 'R'),
        full(8, 'L', flam),
        full(8, 'R', { ...drag, text: 'Drag' }),
        ...times(6, (i) => full(16, hand(i), i === 0 ? slashes(1) : {})),
        T(4, 3, [
          full(8, 'R', { ...drag, text: 'Four' }),
          full(8, 'L', flam),
          full(8, 'R', slashes(2)),
          full(8, 'L', buzz),
        ]),
        D(4, 1, { accent: true, sticking: 'R', ...drag, ...buzz, text: 'Roll' }),
      ],
      { meter: [12, 8] },
    ),
    bar(
      [
        R(32),
        full(32, 'R'),
        full(16, 'L', flam),
        full(8, 'R', { ...drag, ...slashes(3) }),
        T(
          7,
          4,
          times(7, (i) => full(16, hand(i), i === 0 ? { ...flam, text: 'Seven' } : {})),
        ),
        full(8, 'R', { ...drag, ...buzz, text: 'Buzz' }),
        R(16),
        full(16, 'L', flam),
        full(4, 'R', { ...drag, ...slashes(3), text: 'Fine' }),
      ],
      { meter: [4, 4] },
    ),
  ],
  2,
)

/** What `INK_ABOVE` sorts an event by: whether a bracket rides over it, its stems' class, its marks. */
interface BandProbe {
  stack: 'free' | 'tuplet'
  stems: 'plain' | 'thirtySecond'
  marks: 'none' | 'accent' | 'text' | 'accentText'
  score: Score
}

/**
 * The bars `INK_ABOVE` is measured on, one bar per score: for each entry, every kind of event it
 * stands for, its marks on every stroke, bare or with a drag and three slashes or a flam and a buzz —
 * which stay under the stem, and are here to show it. Tuplets of 2 to 13: the bracket's number is a
 * glyph, and half a pixel moves with where it lands. A text over a rest counts as `accentText`.
 */
const MARKS: Record<BandProbe['marks'], Partial<Event>> = {
  none: {},
  accent: { accent: true },
  text: { text: 'Flam accent' },
  accentText: { accent: true, text: 'Flam accent' },
}
const EXTRAS: Partial<Event>[] = [{}, { ...drag, ...slashes(3) }, { ...flam, ...buzz }]
type Shape = { meter: [number, number]; items: (a: Partial<Event>) => Item[] }
const in44 = (items: (a: Partial<Event>) => Item[]): Shape => ({ meter: [4, 4], items })
const SHAPES: Record<BandProbe['stack'], Record<BandProbe['stems'], Shape[]>> = {
  free: {
    plain: [
      in44((a) => [N(1, a)]),
      in44((a) => [N(2, a), N(2, a)]),
      in44((a) => times(4, () => N(4, a))),
      in44((a) => times(8, () => N(8, a))),
      in44((a) => times(16, () => N(16, a))),
      // One stroke per beat: flagged, no beam.
      in44((a) => times(4, () => [N(8, a), R(8)]).flat()),
      in44((a) => times(4, () => [N(16, a), R(16), R(8)]).flat()),
    ],
    thirtySecond: [
      in44((a) => times(32, () => N(32, a))),
      in44((a) => times(4, () => [N(32, a), R(32), R(16), R(8)]).flat()),
      // Sixteenths and an eighth on a beam a 32nd is on: they hang from its beam.
      in44((a) => times(4, () => [N(16, a), N(32, a), N(32, a), N(8, a)]).flat()),
    ],
  },
  tuplet: {
    plain: [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13].flatMap((actual) =>
      ([4, 16] as const).map((base) => {
        const normal = actual === 2 ? 3 : actual === 3 ? 2 : actual < 8 ? 4 : 8
        return {
          meter: [normal, base] as [number, number],
          items: (a: Partial<Event>) => [
            T(
              actual,
              normal,
              times(actual, () => N(base, a)),
            ),
          ],
        }
      }),
    ),
    thirtySecond: [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13].map((actual) => {
      const normal = actual === 2 ? 3 : actual === 3 ? 2 : actual < 8 ? 4 : 8
      return {
        meter: [normal, 32] as [number, number],
        items: (a: Partial<Event>) => [
          T(
            actual,
            normal,
            times(actual, () => N(32, a)),
          ),
        ],
      }
    }),
  },
}
/** A text over a rest, in each context: measured against `accentText`. */
const REST_TEXT: Record<BandProbe['stack'], Record<BandProbe['stems'], Item[]>> = {
  free: {
    plain: [N(8), R(8, undefined, { text: 'Fill' }), ...times(6, () => N(8))],
    thirtySecond: [N(32), R(32, undefined, { text: 'Fill' }), ...times(30, () => N(32))],
  },
  tuplet: {
    plain: [T(3, 2, [R(16, undefined, { text: 'Fill' }), N(16), N(16)]), ...times(14, () => N(16))],
    thirtySecond: [T(3, 2, [N(32), R(32, undefined, { text: 'Fill' }), N(32)]), R(16), N(8), N(4), N(2)],
  },
}
// A score id is kebab-case: `thirtySecond` and `accentText` are lowered.
const probe = (id: string, meter: [number, number], items: Item[]): Score =>
  parseScore({ id: id.toLowerCase(), title: id, bars: [{ meter, items }] })
export const BAND_PROBES: BandProbe[] = (['free', 'tuplet'] as const).flatMap((stack) =>
  (['plain', 'thirtySecond'] as const).flatMap((stems) => [
    ...(Object.keys(MARKS) as BandProbe['marks'][]).flatMap((marks) =>
      SHAPES[stack][stems].flatMap((shape, k) =>
        EXTRAS.map((extra, e) => ({
          stack,
          stems,
          marks,
          score: probe(`${stack}-${stems}-${marks}-${k}-${e}`, shape.meter, shape.items({ ...MARKS[marks], ...extra })),
        })),
      ),
    ),
    {
      stack,
      stems,
      marks: 'accentText' as const,
      score: probe(`${stack}-${stems}-rest-text`, [4, 4], REST_TEXT[stack][stems]),
    },
  ]),
)

/** Every label a row can carry above its staff: bar numbers, 1 to 24, over whole notes, which reach lower. Numbered as drawn, a long piece counts higher: a third digit adds width, not height. */
export const LABEL_PROBE: Score = parseScore({
  id: 'labels',
  title: 'labels',
  bars: times(24, (i) => ({
    ...(i === 0 ? { meter: [4, 4] as [number, number] } : {}),
    items: [N(1)],
  })),
})
