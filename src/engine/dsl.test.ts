import { describe, expect, it } from 'vitest'
import { parseBeat, parseSticking, parseToken, tokenize } from './dsl'

describe('tokenize', () => {
  it('spezza un movimento nei token: ogni token finisce con R, L o -', () => {
    expect(tokenize('RLRL')).toEqual(['R', 'L', 'R', 'L'])
    expect(tokenize('>fR(L)LRR')).toEqual(['>fR', '(L)L', 'R', 'R'])
    expect(tokenize('>f(L)RLRR')).toEqual(['>f(L)R', 'L', 'R', 'R'])
    expect(tokenize('zR-')).toEqual(['zR', '-'])
  })
  it('rifiuta un token incompleto', () => {
    expect(() => tokenize('RL>')).toThrow(/incompleto/)
    expect(() => tokenize('f(L')).toThrow(/incompleto/)
  })
})

describe('parseToken', () => {
  it('colpo semplice e accento', () => {
    expect(parseToken('R')).toEqual({ hand: 'R', accent: false })
    expect(parseToken('>L')).toEqual({ hand: 'L', accent: true })
  })
  it('flam e drag: acciaccatura con la mano opposta, salvo override', () => {
    expect(parseToken('fR')).toEqual({ hand: 'R', accent: false, ornament: 'flam', graceHand: 'L' })
    expect(parseToken('dL')).toEqual({ hand: 'L', accent: false, ornament: 'drag', graceHand: 'R' })
    expect(parseToken('>f(R)R')).toEqual({ hand: 'R', accent: true, ornament: 'flam', graceHand: 'R' })
  })
  it('buzz e tremolo non hanno mano dell acciaccatura', () => {
    expect(parseToken('zR')).toEqual({ hand: 'R', accent: false, ornament: 'buzz' })
    expect(parseToken('tL')).toEqual({ hand: 'L', accent: false, ornament: 'tremolo' })
    expect(() => parseToken('z(L)R')).toThrow(/acciaccatura/)
    expect(() => parseToken('(L)R')).toThrow(/acciaccatura/)
  })
  it('pausa senza prefissi', () => {
    expect(parseToken('-')).toEqual({ hand: null, accent: false })
    expect(() => parseToken('>-')).toThrow(/pausa/)
    expect(() => parseToken('f-')).toThrow(/pausa/)
  })
  it('rifiuta caratteri sconosciuti e prefissi doppi', () => {
    expect(() => parseToken('x')).toThrow(/non valido/)
    expect(() => parseToken('fzR')).toThrow(/non valido/)
    expect(() => parseToken('f>R')).toThrow(/non valido/)
    expect(() => parseToken('>>R')).toThrow(/non valido/)
    expect(() => parseToken('ffR')).toThrow(/non valido/)
  })
  it('rifiuta grace hand su non-flam/drag', () => {
    expect(() => parseToken('t(R)L')).toThrow(/acciaccatura/)
    expect(() => parseToken('(L)-')).toThrow(/pausa/)
  })
  it('rifiuta parentesi malformate e caratteri non validi dentro parentesi', () => {
    expect(() => parseToken('f()R')).toThrow(/non valido/)
    expect(() => parseToken('f(X)R')).toThrow(/non valido/)
  })
})

describe('parseBeat', () => {
  it('la suddivisione è il numero di token', () => {
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
  it('rifiuta più di 8 figure e il movimento vuoto', () => {
    expect(() => parseBeat('RLRLRLRLR')).toThrow(/1-8/)
    expect(() => parseBeat('')).toThrow(/1-8/)
  })
})

describe('parseSticking', () => {
  it('spazio = movimento, | = battuta', () => {
    const bars = parseSticking('RL RL | RL RL', 2)
    expect(bars).toHaveLength(2)
    expect(bars[0].beats).toHaveLength(2)
    expect(bars[1].beats[1].steps.map((s) => s.hand)).toEqual(['R', 'L'])
  })
  it('suddivisioni miste nella stessa battuta', () => {
    const [bar] = parseSticking('RLR LRLR', 2)
    expect(bar.beats.map((b) => b.steps.length)).toEqual([3, 4])
    expect(bar.beats[0].steps.map((s) => s.hand)).toEqual(['R', 'L', 'R'])
    expect(bar.beats[1].steps.map((s) => s.hand)).toEqual(['L', 'R', 'L', 'R'])
  })
  it('tollera spazi attorno alle barre e alle estremità', () => {
    expect(parseSticking('  RL RL |RL RL  ', 2)).toHaveLength(2)
  })
  it('rifiuta la battuta con il numero sbagliato di movimenti', () => {
    expect(() => parseSticking('RL RL RL', 2)).toThrow(/battuta 1: 3 movimenti, attesi 2/)
    expect(() => parseSticking('RL RL | RL', 2)).toThrow(/battuta 2: 1 movimenti, attesi 2/)
  })
  it('rifiuta lo sticking vuoto', () => {
    expect(() => parseSticking('   ', 2)).toThrow(/vuoto/)
  })
  it('rifiuta battute vuote (doppio pipe, leading pipe, trailing pipe)', () => {
    expect(() => parseSticking('RL || RL', 1)).toThrow(/battuta 2: vuota/)
    expect(() => parseSticking('|RL RL', 2)).toThrow(/battuta 1: vuota/)
    expect(() => parseSticking('RL RL|', 2)).toThrow(/battuta 2: vuota/)
  })
})
