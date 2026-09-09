import { describe, expect, it } from 'bun:test'
import { isAbsorbed, judge } from './judge'
import { buildGrid } from './grid'
import { parseExercise } from './exercise'
import type { Slot, Step } from './types'

const step = { hand: 'R' as const, accent: false }
const slotsAt = (times: number[], dur = 0.5): Slot[] =>
  times.map((t, index) => ({ index, t, dur, step, repeat: 0, bar: 0, beat: index, sub: 0 }))
const hit = (t: number, peakDb = -20) => ({ t, peakDb })

describe('judge', () => {
  const slots = slotsAt([1, 1.5, 2, 2.5])

  it('assegna ogni colpo allo slot più vicino e calcola offset in ms', () => {
    const r = judge(slots, [hit(1.01), hit(1.47), hit(2.0)])
    expect(r.judged[0].offsetMs).toBeCloseTo(10)
    expect(r.judged[1].offsetMs).toBeCloseTo(-30)
    expect(r.judged[2].offsetMs).toBeCloseTo(0)
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'good', 'miss'])
    expect(r.extras).toEqual([])
  })

  it('grade ai bordi: 20 ms è good, 20.5 è ok, 40 è ok, 41 è off', () => {
    const r = judge(slotsAt([1, 2, 3, 4], 1), [hit(1.02), hit(2.0205), hit(3.04), hit(4.041)])
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'ok', 'ok', 'off'])
  })

  it('un colpo fuori da ogni finestra è extra e non tocca gli slot', () => {
    const r = judge(slots, [hit(3.0)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged.every((j) => j.grade === 'miss')).toBe(true)
  })

  it('due colpi sullo stesso slot: vince il più vicino, l altro è extra', () => {
    const r = judge(slots, [hit(1.1), hit(0.98)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('due colpi sullo stesso slot, il più vicino arriva prima: il secondo (più lontano) non lo sfratta', () => {
    const r = judge(slots, [hit(0.98), hit(1.1)])
    expect(r.judged[0].hit?.t).toBe(0.98)
    expect(r.extras.map((h) => h.t)).toEqual([1.1])
  })

  it('con now, gli slot con finestra ancora aperta sono pending, non miss', () => {
    const r = judge(slots, [hit(1.0)], { now: 1.6 })
    expect(r.judged.map((j) => j.grade)).toEqual(['good', 'pending', 'pending', 'pending'])
  })

  it('offset positivo = in ritardo', () => {
    const r = judge(slotsAt([1], 1), [hit(1.03)])
    expect(r.judged[0].offsetMs).toBeGreaterThan(0)
  })

  it('finestre personalizzate', () => {
    const r = judge(slotsAt([1], 1), [hit(1.015)], { windows: { goodMs: 10, okMs: 30 } })
    expect(r.judged[0].grade).toBe('ok')
  })

  it('nessuno slot: tutto extra', () => {
    const r = judge([], [hit(1)])
    expect(r.extras).toHaveLength(1)
  })

  it('la finestra è per slot: uno slot corto non prende un colpo che uno lungo prenderebbe', () => {
    const slots: Slot[] = [
      { index: 0, t: 0, dur: 1, step, repeat: 0, bar: 0, beat: 0, sub: 0 },
      { index: 1, t: 1, dur: 0.25, step, repeat: 0, bar: 0, beat: 1, sub: 0 },
    ]
    expect(judge(slots, [hit(0.9)]).judged[1].offsetMs).toBeCloseTo(-100)
    expect(judge(slots, [hit(0.8)]).extras).toHaveLength(1)
  })
})

describe('la finestra è per slot: il buco reale fra terzina e sedicesimo', () => {
  // stesso esercizio del test "suddivisioni miste" di grid.test.ts: 'RLR LRLR' in 2/4 a 60 bpm.
  // slot[2]: t=2/3, dur=1/3 → finestra [1/2, 5/6≈0.8333]. slot[3]: t=1, dur=0.25 → finestra [0.875, 1.125].
  // fra le due finestre resta un buco (0.8333, 0.875) di ~42 ms: l'ordine di grandezza delle soglie good/ok,
  // proprio dove atterrano i colpi reali di un batterista.
  const ex = parseExercise({ id: 'm', name: 'm', timeSignature: [2, 4], steps: 'RLR LRLR', repeats: 1 })
  const grid = buildGrid(ex, 60, 0, { countInBars: 0 })

  it('un colpo nel buco non è preso da nessuno dei due slot vicini: extra', () => {
    const r = judge(grid.slots, [hit(0.85)])
    expect(r.extras).toHaveLength(1)
    expect(r.judged[2].hit).toBeNull()
    expect(r.judged[3].hit).toBeNull()
  })

  it('colpi appena dentro ciascuna finestra vicina vengono presi, non extra', () => {
    const r = judge(grid.slots, [hit(0.82), hit(0.88)])
    expect(r.judged[2].hit?.t).toBe(0.82)
    expect(r.judged[3].hit?.t).toBe(0.88)
    expect(r.extras).toHaveLength(0)
  })
})

const withOrnament = (ornament: Step['ornament']): Step => ({ hand: 'R', accent: false, ornament, graceHand: 'L' })
const slot = (index: number, t: number, dur: number, s: Step = step): Slot => ({ index, t, dur, step: s, repeat: 0, bar: 0, beat: index, sub: 0 })

describe('extra assorbiti dagli ornamenti', () => {
  it('flam: un colpo fino a 60 ms prima del principale è l acciaccatura', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('flam')), slot(1, 1.5, 0.5)]
    const r = judge(slots, [hit(0.96), hit(1.0), hit(1.5)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[0].grade).toBe('good')
    expect(r.absorbed.map((h) => h.t)).toEqual([0.96])
    expect(r.extras).toEqual([])
  })
  it('flam: oltre 60 ms prima resta un extra', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('flam'))]
    const r = judge(slots, [hit(0.93), hit(1.0)])
    expect(r.extras.map((h) => h.t)).toEqual([0.93])
    expect(r.absorbed).toEqual([])
  })
  it('flam: un colpo solo, anche in anticipo, è il principale (non viene assorbito)', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('flam'))], [hit(0.95)])
    expect(r.judged[0].offsetMs).toBeCloseTo(-50)
    expect(r.absorbed).toEqual([])
  })
  it('drag: stessa regola del flam', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('drag'))], [hit(0.95), hit(0.97), hit(1.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.absorbed).toHaveLength(2)
  })
  it('senza ornamento un colpo prima resta un extra', () => {
    const r = judge([slot(0, 1, 0.5)], [hit(0.96), hit(1.0)])
    expect(r.extras.map((h) => h.t)).toEqual([0.96])
  })
  it('buzz: i rimbalzi dentro la durata dello slot sono assorbiti, anche se rubati allo slot dopo', () => {
    const slots = [slot(0, 1, 1, withOrnament('buzz')), slot(1, 2, 1)]
    const r = judge(slots, [hit(1.0), hit(1.05), hit(1.1), hit(1.9), hit(2.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[1].hit?.t).toBe(2.0)
    expect(r.absorbed.map((h) => h.t)).toEqual([1.05, 1.1, 1.9])
    expect(r.extras).toEqual([])
  })
  it('buzz: un colpo dopo la fine dello slot non è assorbito', () => {
    const slots = [slot(0, 1, 0.5, withOrnament('buzz'))]
    const r = judge(slots, [hit(1.0), hit(1.6)])
    expect(r.extras.map((h) => h.t)).toEqual([1.6])
  })
  it('tremolo: come il buzz', () => {
    const r = judge([slot(0, 1, 0.5, withOrnament('tremolo'))], [hit(1.0), hit(1.2)])
    expect(r.absorbed.map((h) => h.t)).toEqual([1.2])
  })
  it('isAbsorbed è esposta per i test di integrazione (richiede il claim dello slot ornamentato)', () => {
    expect(isAbsorbed([slot(0, 1, 0.5, withOrnament('flam'))], hit(0.95), new Set([0]))).toBe(true)
    expect(isAbsorbed([slot(0, 1, 0.5, withOrnament('flam'))], hit(0.95), new Set())).toBe(false)
    expect(isAbsorbed([slot(0, 1, 0.5)], hit(0.95), new Set([0]))).toBe(false)
  })
})

describe('assorbimento: richiede il colpo principale, e non deruba lo slot precedente se è un miss (Ruling 3)', () => {
  it('colpo tardivo prima di un flam veloce: lo slot precedente resta miss, il colpo resta la sua prova (scenario del reviewer)', () => {
    // Scenario letterale del reviewer, senza numeri adattati: 240 bpm, sedicesimi (62.5 ms), slot ordinario
    // a t=1.0, flam a t=1.0625. La nota precedente arriva 40 ms tardi (t=1.04): è più vicina al flam (22.5 ms)
    // che al proprio slot (40 ms), quindi durante l'assegnazione va candidata al flam — e viene poi sfrattata
    // dal vero colpo del flam (t=1.0655, quasi a tempo). Lo slot precedente non riceve mai un candidato: resta
    // miss. Senza la condizione 4 quell'extra (dista solo 22.5 ms dal flam, ben dentro i 60 ms) verrebbe
    // assorbito come acciaccatura, cancellando l'unica prova del miss. Con la condizione 4 lo slot precedente
    // è un miss non assegnato → l'assorbimento è bloccato, il colpo resta visibile in extras accanto al miss.
    const prev = slot(0, 1.0, 0.0625, step)
    const flamSlot = slot(1, 1.0625, 0.0625, withOrnament('flam'))
    const r = judge([prev, flamSlot], [hit(1.04), hit(1.0655)])
    expect(r.judged[0].grade).toBe('miss')
    expect(r.judged[0].hit).toBeNull()
    expect(r.judged[1].hit?.t).toBe(1.0655)
    expect(r.judged[1].grade).toBe('good')
    expect(r.extras.map((h) => h.t)).toEqual([1.04])
    expect(r.absorbed).toEqual([])
  })

  it('caso normale: slot precedente assegnato, flam assegnato, acciaccatura 40 ms prima → assorbita', () => {
    const prev = slot(0, 1, 0.5, step)
    const flamSlot = slot(1, 1.5, 0.5, withOrnament('flam'))
    const r = judge([prev, flamSlot], [hit(1.0), hit(1.46), hit(1.5)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.judged[1].hit?.t).toBe(1.5)
    expect(r.absorbed.map((h) => h.t)).toEqual([1.46])
    expect(r.extras).toEqual([])
  })

  it('flam a inizio griglia, nessuno slot precedente: la condizione 4 è vacuamente vera, acciaccatura assorbita', () => {
    const flamSlot = slot(0, 1, 0.5, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.96), hit(1.0)])
    expect(r.judged[0].hit?.t).toBe(1.0)
    expect(r.absorbed.map((h) => h.t)).toEqual([0.96])
    expect(r.extras).toEqual([])
  })

  it('flam saltato: lo slot resta miss e il colpo vagante prima di esso resta extra, non assorbito', () => {
    const flamSlot = slot(0, 1, 0.06, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.95)])
    expect(r.judged[0].grade).toBe('miss')
    expect(r.judged[0].hit).toBeNull()
    expect(r.extras.map((h) => h.t)).toEqual([0.95])
    expect(r.absorbed).toEqual([])
  })

  it('confine esatto dei 60 ms: dentro (anche al bordo) è assorbito, appena fuori resta extra', () => {
    // Nessuno slot precedente: la condizione 4 è vacua, la soglia in gioco è solo ABSORB_BEFORE_S = 60 ms.
    // Finestra dello slot (100 ms → 50 ms) più stretta di tutti gli scarti sotto, così i tre colpi diventano
    // extra direttamente, senza competere con il colpo principale.
    const flamSlot = slot(0, 0.5, 0.1, withOrnament('flam'))
    const r = judge([flamSlot], [hit(0.439), hit(0.44), hit(0.441), hit(0.5)])
    expect(r.judged[0].hit?.t).toBe(0.5)
    expect(r.absorbed.map((h) => h.t)).toEqual([0.44, 0.441]) // 60 ms esatti e 59 ms: dentro
    expect(r.extras.map((h) => h.t)).toEqual([0.439]) // 61 ms: fuori
  })

  it('buzz: i bordi esatti della durata sono fuori, intervallo aperto (slot.t, slot.t + dur)', () => {
    const s = [slot(0, 1, 0.5, withOrnament('buzz'))]
    const claimed = new Set([0])
    expect(isAbsorbed(s, hit(1), claimed)).toBe(false) // esattamente slot.t: non ancora dentro
    expect(isAbsorbed(s, hit(1.5), claimed)).toBe(false) // esattamente slot.t + dur: già fuori
    expect(isAbsorbed(s, hit(1.25), claimed)).toBe(true) // a metà: dentro, sanity check
  })
})
