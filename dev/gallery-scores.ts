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
/** A ghost note (parenthesised head). */
const G = (base: NoteBase, id: InstrumentId = 'snare', extra: Partial<Event> = {}): Event => ({
  duration: { base },
  notes: [{ instrument: id, ghost: true }],
  ...extra,
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
    'A plain "3" over each eighth triplet (no ratio), "5", "6", "7" over the sixteenth groups, each group beamed as one unit inside its quarter and never joined to the neighbours; the quarter triplet bracketed with no beam; the rest inside the last triplet keeps its place under the bracket; a sextuplet of eighths spanning two beats, one bracket and one beam over the six.',
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
    'voices',
    'Two voices: hands up, feet down, sharing instants',
    'Stems up for the hands, down for the feet. Bar 1: hi-hat eighths with the snare on 2 and 4 as chords; kick on 1 and 3 below, with quarter rests below the middle line on 2 and 4. Bar 2: ride eighths with the bell on 3; kick and hi-hat foot alternating. Bar 3: snare, high tom above it, mid tom, floor tom below; two half-note kicks. Bar 4: crash + snare, a rest above the middle line, hi-hat + snare + floor tom as a three-note chord, a half; a whole-note kick. A kick under a hi-hat eighth sits on the same x.',
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
      bar([N(4, ['crash', 'snare']), R(4), N(2, ['hihat', 'snare', 'tom-floor'])], [N(1, 'kick')]),
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
  figure(
    'ghost',
    'Ghost notes: parenthesised heads, alone and inside a chord',
    'Eighths alternating plain and parenthesised on the snare; then a hi-hat + snare chord where ONLY the snare head is in parentheses; then a plain quarter. The parentheses hug the head and never touch the neighbour.',
    [
      bar([
        N(8),
        G(8),
        N(8),
        G(8),
        { duration: { base: 4 }, notes: [{ instrument: 'hihat' }, { instrument: 'snare', ghost: true }] },
        N(4),
      ]),
    ],
  ),
  figure(
    'accents',
    'Accents above the note, in both voices',
    'A ">" above the first eighth of each beat pair (over the beam, not under it), above the accented quarter; below, a kick with an accent — above its head, inside the staff — then a rest and a half-note kick without one.',
    [
      bar(
        [
          N(8, 'snare', { accent: true }),
          N(8),
          N(8, 'snare', { accent: true }),
          N(8),
          N(4, 'snare', { accent: true }),
          N(4),
        ],
        [N(4, 'kick', { accent: true }), R(4), N(2, 'kick')],
      ),
    ],
  ),
  figure(
    'open-closed',
    'Open and closed hi-hat: "o" and "+" above the note',
    'Hi-hat eighths: a small circle above the 2nd and 6th, a plus above the 4th and 8th, sitting above the stem end; a kick under each beat below. The symbols stay put when the note also carries an accent (the 6th).',
    [
      bar(
        [
          N(8, 'hihat'),
          { duration: { base: 8 }, notes: [{ instrument: 'hihat', open: true }] },
          N(8, 'hihat'),
          { duration: { base: 8 }, notes: [{ instrument: 'hihat', closed: true }] },
          N(8, 'hihat'),
          { duration: { base: 8 }, notes: [{ instrument: 'hihat', open: true }], accent: true },
          N(8, 'hihat'),
          { duration: { base: 8 }, notes: [{ instrument: 'hihat', closed: true }] },
        ],
        [N(4, 'kick'), N(4, 'kick'), N(4, 'kick'), N(4, 'kick')],
      ),
    ],
  ),
  figure(
    'grace',
    'Flam and drag: grace notes before the note; the gutter at a row start',
    'Bar 1: a slashed grace eighth before the first quarter (flam), two beamed grace sixteenths before the second (drag), a flam with the sticking R under the main note, a flam on the high tom whose grace note is on the snare. Bar 2 starts a new row with a flam on beat 1: the grace note sits in the gutter, clear of the clef, and the first note of both rows is on the same x.',
    [
      bar([
        N(4, 'snare', { grace: { kind: 'flam' } }),
        N(4, 'snare', { grace: { kind: 'drag' } }),
        N(4, 'snare', { grace: { kind: 'flam', sticking: 'L' }, sticking: 'R' }),
        N(4, 'tom-high', { grace: { kind: 'flam', instrument: 'snare' } }),
      ]),
      bar([N(4, 'snare', { grace: { kind: 'flam' } }), N(4), N(4), N(4)], undefined, { newRow: true }),
    ],
  ),
  figure(
    'rolls',
    'Rolls: one, two, three tremolo slashes, a buzz; on a half note and with an accent',
    'Bar 1: quarters with 1, 2 and 3 slashes across the stem, then the buzz "z" on the stem. Bar 2: a half note with two slashes, an accented buzz quarter (accent above the z), a quarter.',
    [
      bar([
        N(4, 'snare', { roll: { kind: 'tremolo', slashes: 1 } }),
        N(4, 'snare', { roll: { kind: 'tremolo', slashes: 2 } }),
        N(4, 'snare', { roll: { kind: 'tremolo', slashes: 3 } }),
        N(4, 'snare', { roll: { kind: 'buzz' } }),
      ]),
      bar([
        N(2, 'snare', { roll: { kind: 'tremolo', slashes: 2 } }),
        N(4, 'snare', { roll: { kind: 'buzz' }, accent: true }),
        N(4),
      ]),
    ],
  ),
  figure(
    'sticking',
    'Sticking under the staff: a paradiddle',
    'R L R R L R L L under the eighths, one letter under each head, the accents above the first of each group; the letters are on one line, none drops lower than its neighbour.',
    [
      bar([
        N(8, 'snare', { accent: true, sticking: 'R' }),
        N(8, 'snare', { sticking: 'L' }),
        N(8, 'snare', { sticking: 'R' }),
        N(8, 'snare', { sticking: 'R' }),
        N(8, 'snare', { accent: true, sticking: 'L' }),
        N(8, 'snare', { sticking: 'R' }),
        N(8, 'snare', { sticking: 'L' }),
        N(8, 'snare', { sticking: 'L' }),
      ]),
    ],
  ),
  figure(
    'dynamics',
    'Dynamics pp → ff under the note, in the music font; under the sticking when both are there',
    'Bar 1: pp, p, mp, mf under four quarters; bar 2: f, ff under two halves — the real glyphs, bold and italic, not typed letters. Bar 3: R and L under the snare quarters with mf under the L, below the letter; below the feet, f under the first kick, under its stem; then a dotted quarter rest below the staff, an eighth kick, a quarter rest.',
    [
      bar([
        N(4, 'snare', { dynamic: 'pp' }),
        N(4, 'snare', { dynamic: 'p' }),
        N(4, 'snare', { dynamic: 'mp' }),
        N(4, 'snare', { dynamic: 'mf' }),
      ]),
      bar([N(2, 'snare', { dynamic: 'f' }), N(2, 'snare', { dynamic: 'ff' })]),
      bar(
        [
          N(4, 'snare', { sticking: 'R' }),
          N(4, 'snare', { sticking: 'L', dynamic: 'mf' }),
          N(4, 'snare', { sticking: 'R' }),
          N(4, 'snare', { sticking: 'L' }),
        ],
        [N(4, 'kick', { dynamic: 'f' }), R(4, 1), N(8, 'kick'), R(4)],
      ),
    ],
  ),
  figure(
    'hairpins',
    'Hairpins: inside a bar, across a bar, across a row end',
    'Bar 1: a crescendo from beat 1 to beat 4, below the staff. Bar 2: a diminuendo opening on beat 1 that closes on beat 2 of bar 3; then a crescendo opening on beat 3 of bar 3. Bar 4 starts a new row: the crescendo continues from its first note to beat 4, where it stops — so the first row ends with the open wedge reaching the last note of bar 3 and the second row starts with it.',
    [
      bar([N(4, 'snare', { hairpin: 'cresc' }), N(4), N(4), N(4, 'snare', { hairpin: 'stop' })]),
      bar([N(4, 'snare', { hairpin: 'dim' }), N(4), N(4), N(4)]),
      bar([N(4), N(4, 'snare', { hairpin: 'stop' }), N(4, 'snare', { hairpin: 'cresc' }), N(4)]),
      bar([N(4), N(4), N(4), N(4, 'snare', { hairpin: 'stop' })], undefined, { newRow: true }),
    ],
  ),
  figure(
    'ties',
    'Ties: inside a bar, across a bar, across a row end, on one note of a chord',
    'Bar 1: quarter tied to quarter, then two quarters. Bar 2 ends on a quarter tied into bar 3: the tie crosses the barline. Bar 3 ends on a half tied into bar 4, which starts a new row: a half tie leaves the first row to the right edge and a half tie enters the second row from the left. Bar 5: hi-hat + snare chords where only the snare is tied — one tie, on the snare head.',
    [
      bar([{ duration: { base: 4 }, notes: [{ instrument: 'snare', tie: true }] }, N(4), N(4), N(4)]),
      bar([N(4), N(4), N(4), { duration: { base: 4 }, notes: [{ instrument: 'snare', tie: true }] }]),
      bar([N(4), N(4), { duration: { base: 2 }, notes: [{ instrument: 'snare', tie: true }] }]),
      bar([N(2), N(4), N(4)], undefined, { newRow: true }),
      bar([
        { duration: { base: 2 }, notes: [{ instrument: 'hihat' }, { instrument: 'snare', tie: true }] },
        N(2, ['hihat', 'snare']),
      ]),
    ],
  ),
  figure(
    'text',
    'Text above the note, above an accent, on a two-voice bar',
    '"Groove" above beat 1 and "Fill" above beat 3, above the stems; on beat 3 the note is accented and the text sits above the accent. Bar 2: "Solo" above a kick + snare bar, above the hands.',
    [
      bar([N(4, 'snare', { text: 'Groove' }), N(4), N(4, 'snare', { text: 'Fill', accent: true }), N(4)]),
      bar(
        [N(4, 'snare', { text: 'Solo' }), N(4), N(4), N(4)],
        [N(4, 'kick'), N(4, 'kick'), N(4, 'kick'), N(4, 'kick')],
      ),
    ],
  ),
  figure(
    'repeats',
    'Repeat signs; ×3 on a repeat played three times; an end with no start',
    'Bars 1–2 between a start sign and an end sign. Bars 3–5: a start sign, then an end sign with "×3" in grey above it. Bars 6–7: an end sign with no start before it (the section starts after the previous end, as 50 Workout prints it). The last bar ends with the repeat sign, not the thick final barline.',
    [
      bar(q4(), undefined, { repeat: { start: true } }),
      bar(q4(), undefined, { repeat: { end: {} } }),
      bar(q4(), undefined, { repeat: { start: true } }),
      bar(q4()),
      bar(q4(), undefined, { repeat: { end: { times: 3 } } }),
      bar(q4()),
      bar(q4(), undefined, { repeat: { end: { times: 2 } } }),
    ],
  ),
  figure(
    'endings',
    'Volta brackets: first and second ending; "1. 2." with a third; a two-bar first ending',
    'Row 1: start sign, a bar, then a bracket "1." over the bar that ends with the repeat sign and "2." over the next. Row 2: a bracket "1. 2." over a bar with "×3", "3." over the next. Row 3: a start sign, "1." opening over one bar and CLOSING over the next (one bracket across two bars, the hook only at its end), then "2.".',
    [
      bar(q4(), undefined, { repeat: { start: true } }),
      bar(q4()),
      bar(q4(), undefined, { ending: [1], repeat: { end: {} } }),
      bar(q4(), undefined, { ending: [2] }),
      bar(q4(), undefined, { newRow: true, repeat: { start: true } }),
      bar(q4(), undefined, { ending: [1, 2], repeat: { end: { times: 3 } } }),
      bar(q4(), undefined, { ending: [3] }),
      bar(q4(), undefined, { newRow: true, repeat: { start: true } }),
      bar(q4(), undefined, { ending: [1] }),
      bar(q4(), undefined, { ending: [1], repeat: { end: {} } }),
      bar(q4(), undefined, { ending: [2] }),
    ],
  ),
  figure(
    'simile',
    'Simile: "%" on the bars that repeat the groove, including at a row start',
    'Bar 1 a two-voice groove; bars 2 and 3 a "%" centred in the bar and nothing else; bar 4 starts a new row with a "%" after the clef; bar 5 the groove again with a final barline.',
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
        [N(4, 'kick'), H(4), N(4, 'kick'), H(4)],
      ),
      { simile: true },
      { simile: true },
      { simile: true, newRow: true },
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
        [N(4, 'kick'), H(4), N(4, 'kick'), H(4)],
      ),
    ],
  ),
  figure(
    'tempo',
    'Tempo marks: quarter, half, dotted quarter, and one at a row start next to the bar number',
    '"♩ = 100" above bar 1, "𝅗𝅥 = 60" above bar 3, "♩. = 120" above bar 4; bar 5 starts a new row with "♩ = 90" above it, clear of the grey bar number on its left.',
    [
      bar(q4(), undefined, { tempo: { bpm: 100 } }),
      bar(q4()),
      bar(q4(), undefined, { tempo: { bpm: 60, unit: 2 } }),
      bar(q4(), undefined, { tempo: { bpm: 120, unit: 4, dotted: true } }),
      bar(q4(), undefined, { newRow: true, tempo: { bpm: 90 } }),
    ],
  ),
  figure(
    'meters',
    'Meter changes: 4/4, 3/4, 6/8, 7/8 (2+2+3 and 3+2+2), 2/4, 12/8 at a row start, back to 4/4',
    'Bar 1 in 4/4, then "3/4" drawn inside the row before three quarters (the bar is three quarters wide), "6/8" before six eighths beamed 3+3, "7/8" before seven eighths beamed 2+2+3, then seven eighths beamed 3+2+2 with no new signature (explicit groups), "2/4" before two quarters. Row 2 opens with the clef and "12/8" before twelve eighths beamed in threes, four groups; then "4/4" again.',
    [
      bar(q4()),
      bar([N(4), N(4), N(4)], undefined, { meter: [3, 4] }),
      bar(
        times(6, () => N(8)),
        undefined,
        { meter: [6, 8] },
      ),
      bar(
        times(7, () => N(8)),
        undefined,
        { meter: [7, 8] },
      ),
      bar(
        times(7, () => N(8)),
        undefined,
        { beams: [3, 2, 2] },
      ),
      bar([N(4), N(4)], undefined, { meter: [2, 4] }),
      bar(
        times(12, () => N(8)),
        undefined,
        { meter: [12, 8], newRow: true },
      ),
      bar(q4(), undefined, { meter: [4, 4] }),
    ],
  ),
]
