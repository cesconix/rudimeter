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
    'Three rows of two bars. The percussion clef on every row; "4/4" only on the first; bar numbers 1, 3, 5 in grey above the clef; a thick final barline on the last bar. The three rows have the same width and their first notes sit on the same x.',
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
    'Flam and drag: grace notes before the note; the gutter at a row start',
    'Bar 1: a slashed grace eighth before the first quarter (flam), two beamed grace sixteenths before the second (drag), a flam with the sticking R under the main note, a plain quarter. Bar 2 starts a new row with a flam on beat 1: the grace note sits in the gutter, clear of the clef, and the first note of both rows is on the same x.',
    [
      bar([
        N(4, { grace: { kind: 'flam' } }),
        N(4, { grace: { kind: 'drag' } }),
        N(4, { grace: { kind: 'flam' }, sticking: 'R' }),
        N(4),
      ]),
      bar([N(4, { grace: { kind: 'flam' } }), N(4), N(4), N(4)], { newRow: true }),
    ],
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
    'Repeat signs; ×3 on a repeat played three times; an end with no start',
    'Bars 1–2 between a start sign and an end sign. Bars 3–5: a start sign, then an end sign with "×3" in grey above it. Bars 6–7: an end sign with no start before it (the section starts after the previous end, as 50 Workout prints it). The last bar ends with the repeat sign, not the thick final barline.',
    [
      bar(q4(), { repeat: { start: true } }),
      bar(q4(), { repeat: { end: {} } }),
      bar(q4(), { repeat: { start: true } }),
      bar(q4()),
      bar(q4(), { repeat: { end: { times: 3 } } }),
      bar(q4()),
      bar(q4(), { repeat: { end: { times: 2 } } }),
    ],
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
 * the "×N" of a repeat; below — sticking under every kind of note, ties, beamed rests. Two rows of
 * two bars, a 12/8 change and a tie across the row break: the band holds one row, so the two rows
 * together show whether one row's ink reaches the next. `STAFF_TOP` and `STAFF_BELOW` are measured on it.
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
  'Four bars on two rows, every mark of the pad on as many strokes as it fits: nothing drawn above the top of the band or below its bottom, so no row reaches the next. The Measurements block prints the overflow, if any.',
  [
    bar(
      [
        T(3, 2, [
          full(16, 'R', { ...drag, ...slashes(3), text: 'Flam accent' }),
          full(16, 'L', flam),
          full(16, 'R', buzz),
        ]),
        T(
          5,
          4,
          times(5, (i) => full(32, hand(i), i === 0 ? drag : {})),
        ),
        ...times(8, (i) => full(32, hand(i), i === 0 ? { ...flam, text: 'Rip' } : {})),
        D(8, 1, { accent: true, sticking: 'R', ...drag, ...slashes(3), tie: true }),
        full(16, 'R', flam),
        T(
          6,
          4,
          times(6, (i) => full(16, hand(i), i === 0 ? { ...drag, ...slashes(2), text: 'Six' } : {})),
        ),
      ],
      { repeat: { start: true } },
    ),
    bar(
      [
        R(16, undefined, { text: 'Fill' }),
        full(16, 'R', flam),
        full(8, 'L', { ...drag, ...buzz }),
        T(3, 2, [full(8, 'R', { ...flam, text: 'Flam accent' }), full(8, 'L', slashes(3)), full(8, 'R', drag)]),
        full(4, 'R', { ...drag, ...buzz, text: 'Buzz' }),
        D(8, 2, { accent: true, sticking: 'L', ...drag, ...slashes(3) }),
        full(32, 'R', { tie: true }),
      ],
      { repeat: { end: { times: 3 } } },
    ),
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
      { meter: [12, 8], repeat: { start: true } },
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
      { meter: [4, 4], repeat: { end: { times: 4 } } },
    ),
  ],
  2,
)

/**
 * The cursor band's source: a quarter with its sticking, in two bars of 1/4 on one row. The band
 * must cover the head, the stem and the letter; "Measure cursor" reads the ink of the SECOND bar —
 * the first carries the clef, the signature and the grey bar number, which are not the note's.
 */
export const CURSOR_PROBE: Figure = figure(
  'cursor-probe',
  'Cursor probe',
  'A quarter with R, twice; the second bar is what "Measure cursor" reads.',
  [bar([N(4, { sticking: 'R' })], { meter: [1, 4] }), bar([N(4, { sticking: 'R' })])],
)
