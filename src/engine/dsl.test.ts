import { describe, expect, it } from 'bun:test'
import { parseBeat, parseSticking, parseToken, tokenize } from './dsl'

describe('tokenize', () => {
  it('splits a beat into tokens: every token ends with R, L or -', () => {
    expect(tokenize('RLRL')).toEqual(['R', 'L', 'R', 'L'])
    expect(tokenize('>fR(L)LRR')).toEqual(['>fR', '(L)L', 'R', 'R'])
    expect(tokenize('>f(L)RLRR')).toEqual(['>f(L)R', 'L', 'R', 'R'])
    expect(tokenize('zR-')).toEqual(['zR', '-'])
  })
  it('rejects an incomplete token', () => {
    expect(() => tokenize('RL>')).toThrow(/incomplete/)
    expect(() => tokenize('f(L')).toThrow(/incomplete/)
  })
})

describe('parseToken', () => {
  it('plain stroke and accent', () => {
    expect(parseToken('R')).toEqual({ hand: 'R', accent: false })
    expect(parseToken('>L')).toEqual({ hand: 'L', accent: true })
  })
  it('flam and drag: grace note with the opposite hand, unless overridden', () => {
    expect(parseToken('fR')).toEqual({ hand: 'R', accent: false, ornament: 'flam', graceHand: 'L' })
    expect(parseToken('dL')).toEqual({ hand: 'L', accent: false, ornament: 'drag', graceHand: 'R' })
    expect(parseToken('>f(R)R')).toEqual({ hand: 'R', accent: true, ornament: 'flam', graceHand: 'R' })
  })
  it('buzz and tremolo have no grace note hand', () => {
    expect(parseToken('zR')).toEqual({ hand: 'R', accent: false, ornament: 'buzz' })
    expect(parseToken('tL')).toEqual({ hand: 'L', accent: false, ornament: 'tremolo' })
    expect(() => parseToken('z(L)R')).toThrow(/grace hand/)
    expect(() => parseToken('(L)R')).toThrow(/grace hand/)
  })
  it('rest with no prefixes', () => {
    expect(parseToken('-')).toEqual({ hand: null, accent: false })
    expect(() => parseToken('>-')).toThrow(/rest/)
    expect(() => parseToken('f-')).toThrow(/rest/)
  })
  it('rejects unknown characters and doubled prefixes', () => {
    expect(() => parseToken('x')).toThrow(/invalid/)
    expect(() => parseToken('fzR')).toThrow(/invalid/)
    expect(() => parseToken('f>R')).toThrow(/invalid/)
    expect(() => parseToken('>>R')).toThrow(/invalid/)
    expect(() => parseToken('ffR')).toThrow(/invalid/)
  })
  it('rejects a grace hand on a non-flam/drag', () => {
    expect(() => parseToken('t(R)L')).toThrow(/grace hand/)
    expect(() => parseToken('(L)-')).toThrow(/rest/)
  })
  it('rejects malformed parentheses and invalid characters inside parentheses', () => {
    expect(() => parseToken('f()R')).toThrow(/invalid/)
    expect(() => parseToken('f(X)R')).toThrow(/invalid/)
  })
})

describe('parseBeat', () => {
  it('the subdivision is the number of tokens', () => {
    const beat3 = parseBeat('RLR')
    expect(beat3.steps).toHaveLength(3)
    expect(beat3.steps.map((s) => s.hand)).toEqual(['R', 'L', 'R'])

    const beat1 = parseBeat('R')
    expect(beat1.steps).toHaveLength(1)
    expect(beat1.steps[0].hand).toBe('R')

    const beat8 = parseBeat('RLRLRLRL')
    expect(beat8.steps).toHaveLength(8)
    expect(beat8.steps.map((s) => s.hand)).toEqual(['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L'])
  })
  it('rejects more than 8 notes and the empty beat', () => {
    expect(() => parseBeat('RLRLRLRLR')).toThrow(/1-8/)
    expect(() => parseBeat('')).toThrow(/1-8/)
  })
})

describe('parseSticking', () => {
  it('space = beat, | = bar', () => {
    const bars = parseSticking('RL RL | RL RL', 2)
    expect(bars).toHaveLength(2)
    expect(bars[0].beats).toHaveLength(2)
    expect(bars[1].beats[1].steps.map((s) => s.hand)).toEqual(['R', 'L'])
  })
  it('mixed subdivisions in the same bar', () => {
    const [bar] = parseSticking('RLR LRLR', 2)
    expect(bar.beats.map((b) => b.steps.length)).toEqual([3, 4])
    expect(bar.beats[0].steps.map((s) => s.hand)).toEqual(['R', 'L', 'R'])
    expect(bar.beats[1].steps.map((s) => s.hand)).toEqual(['L', 'R', 'L', 'R'])
  })
  it('tolerates spaces around the pipes and at the ends', () => {
    expect(parseSticking('  RL RL |RL RL  ', 2)).toHaveLength(2)
  })
  it('rejects the bar with the wrong number of beats', () => {
    expect(() => parseSticking('RL RL RL', 2)).toThrow(/bar 1: 3 beats, expected 2/)
    expect(() => parseSticking('RL RL | RL', 2)).toThrow(/bar 2: 1 beats, expected 2/)
  })
  it('rejects the empty sticking', () => {
    expect(() => parseSticking('   ', 2)).toThrow(/empty sticking/)
  })
  it('rejects empty bars (double pipe, leading pipe, trailing pipe)', () => {
    expect(() => parseSticking('RL || RL', 1)).toThrow(/bar 2: empty/)
    expect(() => parseSticking('|RL RL', 2)).toThrow(/bar 1: empty/)
    expect(() => parseSticking('RL RL|', 2)).toThrow(/bar 2: empty/)
  })
})
