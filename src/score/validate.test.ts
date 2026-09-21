import { describe, expect, it } from 'bun:test'
import type { Bar, Event, Item, NoteBase, Score } from './types'
import { parseScore, validate } from './validate'

const n = (base: NoteBase = 4, extra: Partial<Event> = {}): Event => ({ duration: { base }, ...extra })
const r = (base: NoteBase = 4, extra: Partial<Event> = {}): Event => ({ duration: { base }, rest: true, ...extra })
const twoFour = (items: Item[], extra: Partial<Bar> = {}): Bar => ({ meter: [2, 4], ...extra, items })
const triplet = (): Item => ({ tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), n(8)] })

/** A valid 2/4 piece: one bar, a quarter and two eighths. Every test breaks one thing in a copy of it. */
const valid = (): Score => ({ id: 'valid', title: 'Valid', bars: [twoFour([n(), n(8), n(8)])] })
const withBars = (...bars: Bar[]): Score => ({ ...valid(), bars })
const paths = (s: Score) => validate(s).map((p) => p.path)
/** What the type system refuses and a JSON file can still say: a wrong type, a key the model does not have. */
const loose = (s: unknown): Score => s as Score
/** The fixture with one event replaced: `at(0, { rest: 'yes' })` is bar 0, item 0. */
const at = (i: number, event: unknown): Score => {
  const s = valid()
  ;(s.bars[0].items as unknown[])[i] = event
  return s
}
const E0 = 'bars[0].items[0]'

describe('validate', () => {
  it('accepts the fixture, and a source', () => {
    expect(validate(valid())).toEqual([])
    expect(validate({ ...valid(), source: 'Stick Control, p. 5' })).toEqual([])
  })

  it('1. the id matches [a-z0-9-]+ and the source is a string', () => {
    expect(paths({ ...valid(), id: 'Not Valid' })).toEqual(['id'])
    expect(paths(loose({ ...valid(), source: 12 }))).toEqual(['source'])
  })

  it('2. needs at least one bar and a meter on the first', () => {
    expect(paths({ ...valid(), bars: [] })).toEqual(['bars'])
    // No meter, no sum against the 4/4 `metersOf` assumes: one problem.
    expect(paths(withBars({ items: [n(), n()] }))).toEqual(['bars[0].meter'])
  })

  it('3. checks the meter, and reports a bad one once, without a sum or a beams check against it', () => {
    expect(paths(withBars({ meter: [3, 6], items: [n()] }))).toEqual(['bars[0].meter'])
    expect(paths(withBars({ meter: [0, 4], items: [n()] }))).toEqual(['bars[0].meter'])
    expect(paths(withBars({ meter: [4, 64], items: [n()] }))).toEqual(['bars[0].meter'])
    expect(paths(withBars({ meter: [3, 6], beams: [1, 2], items: [n()] }))).toEqual(['bars[0].meter'])
    expect(paths(loose({ ...valid(), bars: [{ meter: 4, items: [n()] }] }))).toEqual(['bars[0].meter'])
    // The meter in force is inherited: bar 2 is checked against bar 1's 2/4.
    expect(paths(withBars(twoFour([n(), n()]), { items: [n(), n(), n()] }))).toEqual(['bars[1].items'])
  })

  it('4. beams are positive integers summing to the numerator', () => {
    expect(paths(withBars(twoFour([n(), n()], { beams: [1, 2] })))).toEqual(['bars[0].beams'])
    expect(paths(withBars(twoFour([n(), n()], { beams: [0, 2] })))).toEqual(['bars[0].beams'])
    expect(paths(withBars(twoFour([n(), n()], { beams: [1, 1] })))).toEqual([])
  })

  it('5. repeats do not nest and play at least twice', () => {
    const b = () => twoFour([n(), n()])
    expect(paths(withBars({ ...b(), repeat: { start: true } }, { ...b(), repeat: { start: true } }))).toEqual([
      'bars[1].repeat.start',
    ])
    expect(paths(withBars({ ...b(), repeat: { end: { times: 1 } } }))).toEqual(['bars[0].repeat.end.times'])
    expect(paths(withBars({ ...b(), repeat: { end: { times: 2.5 } } }))).toEqual(['bars[0].repeat.end.times'])
    expect(paths(withBars({ ...b(), repeat: { start: true, end: {} } }))).toEqual([])
    expect(paths(withBars({ ...b(), repeat: { start: true } }, { ...b(), repeat: { end: { times: 3 } } }))).toEqual([])
  })

  it('6. durations and tuplets are well formed', () => {
    expect(paths(at(0, n(3 as never)))).toEqual([`${E0}.duration.base`])
    expect(paths(at(0, { duration: { base: 4, dots: 3 } }))).toEqual([`${E0}.duration.dots`])
    expect(paths(at(0, { rest: true }))).toEqual([`${E0}.duration`])
    const bad = { tuplet: { actual: 0, normal: 2 }, items: [n(8), n(8), n(8)] }
    expect(paths(withBars(twoFour([n(), bad as never])))).toEqual(['bars[0].items[1].tuplet'])
    const empty = { tuplet: { actual: 3, normal: 2 }, items: [] }
    expect(paths(withBars(twoFour([n(), empty as never])))).toEqual(['bars[0].items[1].items'])
    const nested = { tuplet: { actual: 3, normal: 2 }, items: [n(8), n(8), triplet()] }
    expect(paths(withBars(twoFour([n(), nested as never])))).toEqual(['bars[0].items[1].items[2]'])
    expect(paths(withBars(twoFour([n(), triplet()])))).toEqual([])
  })

  it('7. a rest carries no accent, sticking, grace, roll or tie; a text is fine', () => {
    for (const extra of [
      { accent: true },
      { sticking: 'R' },
      { grace: { kind: 'flam' } },
      { roll: { kind: 'buzz' } },
      { tie: true },
    ] as Partial<Event>[])
      expect(paths(at(0, r(4, extra)))).toEqual([E0])
    expect(paths(at(0, r(4, { text: 'Rest' })))).toEqual([])
  })

  it('8. every value is one of the ones the model has, and a flag is true', () => {
    expect(paths(at(0, n(4, { sticking: 'X' as never })))).toEqual([`${E0}.sticking`])
    expect(paths(at(0, n(4, { grace: { kind: 'ruff' as never } })))).toEqual([`${E0}.grace.kind`])
    expect(paths(at(0, n(4, { roll: { kind: 'x' } as never })))).toEqual([`${E0}.roll.kind`])
    expect(paths(at(0, n(4, { roll: { kind: 'tremolo', slashes: 4 as never } })))).toEqual([`${E0}.roll.slashes`])
    expect(paths(at(0, n(4, { beam: 'middle' as never })))).toEqual([`${E0}.beam`])
    expect(paths(at(0, n(4, { text: 5 as never })))).toEqual([`${E0}.text`])
    expect(paths(at(0, { duration: { base: 4 }, rest: 'yes' }))).toEqual([`${E0}.rest`])
    expect(paths(at(0, { duration: { base: 4 }, accent: false }))).toEqual([`${E0}.accent`])
    expect(paths(at(0, { duration: { base: 4 }, tie: 1 }))).toEqual([`${E0}.tie`])
    expect(paths(loose({ ...valid(), bars: [{ ...valid().bars[0], newRow: 'yes' }] }))).toEqual(['bars[0].newRow'])
    expect(paths(loose({ ...valid(), bars: [{ ...valid().bars[0], repeat: { start: 1 } }] }))).toEqual([
      'bars[0].repeat.start',
    ])
  })

  it('9. the items sum to the meter', () => {
    expect(paths(withBars(twoFour([n()])))).toEqual(['bars[0].items'])
    expect(validate(withBars(twoFour([n(), n(), n(8)])))[0].message).toBe('sums to 5/8, the bar is 1/2')
    expect(paths(withBars(twoFour([n(), triplet()])))).toEqual([])
  })

  it('10. explicit beams: well nested, every beamable event marked, nothing longer than an eighth marked', () => {
    // The unmarked eighth is reported as the bar goes; the beam left open is reported on the event that began it.
    expect(paths(withBars(twoFour([n(8, { beam: 'begin' }), n(8), n()])))).toEqual([
      'bars[0].items[1].beam',
      'bars[0].items[0].beam',
    ])
    expect(paths(withBars(twoFour([n(8, { beam: 'end' }), n(8, { beam: 'begin' }), n()])))).toEqual([
      'bars[0].items[0].beam',
      'bars[0].items[1].beam',
    ])
    expect(paths(withBars(twoFour([n(8, { beam: 'begin' }), n(8, { beam: 'end' }), n(4, { beam: 'begin' })])))).toEqual(
      ['bars[0].items[2].beam'],
    )
    expect(paths(withBars(twoFour([n(8, { beam: 'begin' }), n(8, { beam: 'end' }), n()])))).toEqual([])
  })

  it('11. a tie reaches the next stroke of the piece, across the barline', () => {
    expect(paths(withBars(twoFour([n(4, { tie: true }), n()])))).toEqual([])
    expect(paths(withBars(twoFour([n(), n(4, { tie: true })]), twoFour([n(), n()])))).toEqual([])
    expect(paths(withBars(twoFour([n(), n(4, { tie: true })]), twoFour([r(), n()])))).toEqual(['bars[0].items[1].tie'])
    const last = validate(withBars(twoFour([n(), n(4, { tie: true })])))
    expect(last).toEqual([
      { path: 'bars[0].items[1].tie', message: 'the last event of the piece has nothing to tie to' },
    ])
  })

  it('12. an unknown key at any level is a problem named by its path', () => {
    const bar0 = valid().bars[0]
    expect(paths(loose({ ...valid(), parts: [] }))).toEqual(['parts'])
    expect(paths(loose({ ...valid(), instruments: {} }))).toEqual(['instruments'])
    for (const key of ['tempo', 'ending', 'simile', 'parts'])
      expect(paths(loose({ ...valid(), bars: [{ ...bar0, [key]: true }] }))).toEqual([`bars[0].${key}`])
    expect(paths(loose({ ...valid(), bars: [{ ...bar0, repeat: { start: true, times: 2 } }] }))).toEqual([
      'bars[0].repeat.times',
    ])
    expect(paths(loose({ ...valid(), bars: [{ ...bar0, repeat: { end: { count: 2 } } }] }))).toEqual([
      'bars[0].repeat.end.count',
    ])
    for (const key of ['notes', 'hidden', 'dynamic', 'hairpin', 'stiking'])
      expect(paths(at(0, { duration: { base: 4 }, [key]: true }))).toEqual([`${E0}.${key}`])
    expect(paths(at(0, { duration: { base: 4, dot: 1 } }))).toEqual([`${E0}.duration.dot`])
    expect(paths(at(0, { duration: { base: 4 }, grace: { kind: 'flam', instrument: 'snare' } }))).toEqual([
      `${E0}.grace.instrument`,
    ])
    expect(paths(at(0, { duration: { base: 4 }, grace: { kind: 'flam', sticking: 'L' } }))).toEqual([
      `${E0}.grace.sticking`,
    ])
    expect(paths(at(0, { duration: { base: 4 }, roll: { kind: 'buzz', slashes: 1 } }))).toEqual([`${E0}.roll.slashes`])
    expect(paths(withBars(twoFour([n(), { ...triplet(), beam: 'begin' } as never])))).toEqual(['bars[0].items[1].beam'])
    expect(
      paths(
        withBars(
          twoFour([n(), { tuplet: { actual: 3, normal: 2, ratio: '3:2' }, items: [n(8), n(8), n(8)] } as never]),
        ),
      ),
    ).toEqual(['bars[0].items[1].tuplet.ratio'])
    // A file in the kit shape fails by name: the part list, the bar's parts, and the items it does not have.
    const kit = {
      id: 'kit',
      title: 'Kit',
      parts: [{ id: 'kit', kind: 'drumset' }],
      bars: [{ meter: [4, 4], parts: { kit: { voices: [{ stem: 'up', items: [n(1)] }] } } }],
    }
    expect(paths(loose(kit))).toEqual(['parts', 'bars[0].parts', 'bars[0].items'])
    expect(validate(loose(kit))[0]).toEqual({ path: 'parts', message: 'unknown key' })
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
    expect(() => parseScore({ id: 'x', title: 'x', bars: 'none' })).toThrow('not a score')
  })
  it('names every problem', () => {
    const s = valid()
    s.id = 'Bad Id'
    s.bars[0].repeat = { end: { times: 1 } }
    expect(() => parseScore(s)).toThrow(
      'Bad Id: id: must match [a-z0-9-]+; bars[0].repeat.end.times: must be an integer ≥ 2',
    )
  })
  it('turns a crash on a malformed bar into a named error', () => {
    const s = valid() as unknown as { bars: unknown[] }
    s.bars[0] = { meter: [2, 4], items: [null] }
    expect(() => parseScore(s)).toThrow('valid: malformed score')
  })
})
