import { describe, expect, it } from 'bun:test'
import { parseExercise } from './exercise'
import { buildGrid, isSilentBar, repeatAt, replanGrid, slotIndexAt } from './grid'

const stone1 = parseExercise({ id: 's1', name: 's1', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 2 })

describe('buildGrid', () => {
  it('count-in di 1 battuta, poi 8 ottavi × 2 ripetizioni ogni 0.5 s a 60 bpm', () => {
    const g = buildGrid(stone1, 60, 10)
    expect(g.countInEnd).toBeCloseTo(12, 6)
    expect(g.slots).toHaveLength(16)
    expect(g.slots[0].t).toBeCloseTo(12, 6)
    expect(g.slots[15].t).toBeCloseTo(12 + 15 * 0.5, 6)
    expect(g.slots[9]).toMatchObject({ index: 9, repeat: 1, bar: 0, beat: 0, sub: 1 })
    expect(g.slots[5].bar).toBe(1)
    g.slots.forEach((s) => {
      expect(s.dur).toBeCloseTo(0.5, 6)
    })
    expect(g.minStepDur).toBeCloseTo(0.5, 6)
    expect(g.end).toBeCloseTo(20, 6)
    expect(g.repeats.map((r) => r.bpm)).toEqual([60, 60])
    expect(g.repeats[1].start).toBeCloseTo(16, 6)
  })
  it('un click per movimento, count-in incluso, kind bar sul primo movimento della battuta', () => {
    const g = buildGrid(stone1, 120, 0)
    expect(g.countInClicks).toHaveLength(2)
    expect(g.clicks).toHaveLength(2 + 2 * 2 * 2)
    expect(g.clicks[1].t).toBeCloseTo(0.5, 6)
    expect(g.clicks.map((c) => c.kind)).toEqual([
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
      'bar',
      'beat',
    ])
    expect(g.clicks.every((c) => !c.silent)).toBe(true)
  })
  it('suddivisioni miste: terzina e semicrome nello stesso esercizio, dur per slot', () => {
    const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    const expected = [0, 1 / 3, 2 / 3, 1, 1.25, 1.5, 1.75]
    g.slots.forEach((s, i) => {
      expect(s.t).toBeCloseTo(expected[i], 6)
    })
    expect(g.slots[0].dur).toBeCloseTo(1 / 3, 6)
    expect(g.slots[3].dur).toBeCloseTo(0.25, 6)
    expect(g.minStepDur).toBeCloseTo(0.25, 6)
  })
  it('le pause non generano slot ma occupano tempo', () => {
    const ex = parseExercise({ id: 'p', name: 'p', timeSignature: [2, 4], steps: 'R- L-', repeats: 1 })
    const g = buildGrid(ex, 60, 0, { countInBars: 0 })
    expect(g.slots.map((s) => s.t)).toEqual([0, 1])
    expect(g.slots.map((s) => s.step.hand)).toEqual(['R', 'L'])
    expect(g.slots.map((s) => s.index)).toEqual([0, 1])
  })
  it('count-in di 0 battute parte subito', () => {
    const g = buildGrid(stone1, 60, 5, { countInBars: 0 })
    expect(g.countInEnd).toBeCloseTo(5, 6)
    expect(g.countInClicks).toEqual([])
  })
  it('count-in di 2 battute', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 2 })
    expect(g.countInEnd).toBeCloseTo(4, 6)
    expect(g.countInClicks).toHaveLength(4)
    expect(g.countInClicks.map((c) => c.kind)).toEqual(['bar', 'beat', 'bar', 'beat'])
  })
  it('click di suddivisione: 2 per movimento, kind sub sugli intermedi', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 2 } })
    expect(g.clicks.slice(0, 4).map((c) => [c.t, c.kind])).toEqual([
      [0, 'bar'],
      [0.5, 'sub'],
      [1, 'beat'],
      [1.5, 'sub'],
    ])
  })
  it('click di suddivisione: 3 per movimento, kind sub sui due intermedi', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 3 } })
    const first6 = g.clicks.slice(0, 6)
    expect(first6.map((c) => c.kind)).toEqual(['bar', 'sub', 'sub', 'beat', 'sub', 'sub'])
    const expectedT = [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3]
    first6.forEach((c, i) => {
      expect(c.t).toBeCloseTo(expectedT[i], 6)
    })
  })
  it('click di suddivisione: 4 per movimento, kind sub sui tre intermedi', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 0, metronome: { clickSubdivision: 4 } })
    const first4 = g.clicks.slice(0, 4)
    expect(first4.map((c) => c.kind)).toEqual(['bar', 'sub', 'sub', 'sub'])
    const expectedT = [0, 0.25, 0.5, 0.75]
    first4.forEach((c, i) => {
      expect(c.t).toBeCloseTo(expectedT[i], 6)
    })
  })
  it('gap training: 1 battuta con click e 1 senza, contando dalla prima dopo il count-in, anche fra ripetizioni', () => {
    const g = buildGrid(stone1, 60, 0, { countInBars: 1, metronome: { clickSubdivision: 1, gap: { on: 1, off: 1 } } })
    expect(g.countInClicks.every((c) => !c.silent)).toBe(true)
    expect(g.repeats[0].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.repeats[1].clicks.map((c) => c.silent)).toEqual([false, false, true, true])
    expect(g.slots).toHaveLength(16)
  })
})

describe('isSilentBar', () => {
  it('on 2 off 2: battute 0,1 suonano, 2,3 tacciono, 4 suona', () => {
    expect([0, 1, 2, 3, 4].map((b) => isSilentBar(b, { on: 2, off: 2 }))).toEqual([false, false, true, true, false])
  })
  it('senza gap, o con off 0 oppure on 0, mai silenziosa', () => {
    expect(isSilentBar(3)).toBe(false)
    expect(isSilentBar(3, { on: 1, off: 0 })).toBe(false)
    expect(isSilentBar(3, { on: 0, off: 2 })).toBe(false)
  })
})

describe('replanGrid', () => {
  it('rifà le ripetizioni da 1 in poi a 120 bpm, tiene la 0, continua gli indici', () => {
    const g = buildGrid(stone1, 60, 0)
    const g2 = replanGrid(g, stone1, 1, 120, { clickSubdivision: 1 })
    expect(g2.repeats[0]).toEqual(g.repeats[0])
    expect(g2.repeats[1].bpm).toBe(120)
    // assegnazione diretta nel codice (start = kept[last].end passato a buildRepeat): bit-per-bit
    expect(g2.repeats[1].start).toBe(g.repeats[0].end)
    expect(g2.repeats[1].end).toBeCloseTo(g.repeats[0].end + 2, 6)
    expect(g2.slots.map((s) => s.index)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(g2.slots[8].dur).toBeCloseTo(0.25, 6)
    expect(g2.end).toBeCloseTo(8, 6)
    expect(g2.countInClicks).toEqual(g.countInClicks)
    expect(g2.clicks).toHaveLength(g.clicks.length)
    expect(g2.minStepDur).toBeCloseTo(0.25, 6)
    // la ripetizione rifatta a 120 bpm: click ogni 0.5 s (non più 1 s), non solo il conteggio
    expect(g2.repeats[1].clicks.map((c) => [c.t, c.kind])).toEqual([
      [6, 'bar'],
      [6.5, 'beat'],
      [7, 'bar'],
      [7.5, 'beat'],
    ])
  })
})

describe('slotIndexAt / repeatAt', () => {
  const g = buildGrid(stone1, 60, 0) // countInEnd 2, uno slot ogni 0.5 s, 16 slot, ripetizioni [2,6) e [6,10)
  it('prima del primo slot: -1, ripetizione 0', () => {
    expect(slotIndexAt(g, 1)).toBe(-1)
    expect(repeatAt(g, 1)).toBe(0)
  })
  it('sullo slot e subito dopo: quello slot', () => {
    expect(slotIndexAt(g, 2)).toBe(0)
    expect(slotIndexAt(g, 2.49)).toBe(0)
    expect(slotIndexAt(g, 7)).toBe(10)
    expect(repeatAt(g, 7)).toBe(1)
    expect(repeatAt(g, 5.99)).toBe(0)
  })
  it('oltre la fine: ultimo slot, ultima ripetizione', () => {
    expect(slotIndexAt(g, 100)).toBe(15)
    expect(repeatAt(g, 100)).toBe(1)
  })
})

describe('suono guida', () => {
  // Esercizio con un accento e una pausa: la guida deve seguire le NOTE, non i movimenti.
  const mixed = parseExercise({ id: 'g', name: 'g', timeSignature: [2, 4], steps: '>RL R- | RL RL', repeats: 1 })

  it('spenta di default: nella coda ci sono solo click di metronomo', () => {
    const g = buildGrid(mixed, 60, 0)
    expect(g.clicks.some((c) => c.kind === 'note' || c.kind === 'note-accent')).toBe(false)
  })

  it('accesa: un evento su ogni nota, al suo stesso istante, accentato dove lo è la nota', () => {
    const g = buildGrid(mixed, 60, 0, { metronome: { clickSubdivision: 1, guide: true } })
    const guide = g.clicks.filter((c) => c.kind === 'note' || c.kind === 'note-accent')
    // Sette note: la pausa del secondo movimento non produce nulla, come non produce slot.
    expect(guide).toHaveLength(g.slots.length)
    expect(guide.map((c) => c.t)).toEqual(g.slots.map((s) => s.t))
    expect(guide.map((c) => c.kind)).toEqual(g.slots.map((s) => (s.step.accent ? 'note-accent' : 'note')))
  })

  it('nelle battute mute del gap tace come il click, altrimenti il gap training non esisterebbe', () => {
    const g = buildGrid(mixed, 60, 0, { metronome: { clickSubdivision: 1, guide: true, gap: { on: 1, off: 1 } } })
    const guide = g.clicks.filter((c) => c.kind === 'note' || c.kind === 'note-accent')
    // Battuta 0 suona, battuta 1 tace: la guida ha lo stesso `silent` dello slot che l'ha generata.
    expect(guide.filter((c) => !c.silent).map((c) => c.t)).toEqual(g.slots.filter((s) => s.bar === 0).map((s) => s.t))
    expect(guide.filter((c) => c.silent).map((c) => c.t)).toEqual(g.slots.filter((s) => s.bar === 1).map((s) => s.t))
  })

  it('sopravvive al cambio di bpm: le ripetizioni rifatte la riportano', () => {
    const two = parseExercise({ id: 'g2', name: 'g2', timeSignature: [2, 4], steps: 'RL RL', repeats: 2 })
    const metro = { clickSubdivision: 1 as const, guide: true }
    const g = buildGrid(two, 60, 0, { metronome: metro })
    const g2 = replanGrid(g, two, 1, 120, metro)
    const guide = g2.repeats[1].clicks.filter((c) => c.kind === 'note')
    expect(guide.map((c) => c.t)).toEqual(g2.repeats[1].slots.map((s) => s.t))
  })
})
