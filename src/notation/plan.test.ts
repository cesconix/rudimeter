import { describe, expect, it } from 'vitest'
import { durationFor, graceHands, planExercise, planRepeat, tupletFor } from './plan'
import { parseExercise } from '../engine/exercise'
import { buildGrid } from '../engine/grid'

describe('durationFor / tupletFor', () => {
  it('1 → q, 2 → 8, 3 → 8 in terzina, 4 → 16, 5/6/7 → 16 in gruppo irregolare, 8 → 32', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(durationFor)).toEqual(['q', '8', '8', '16', '16', '16', '16', '32'])
    expect(tupletFor(3)).toEqual({ numNotes: 3, notesOccupied: 2 })
    expect(tupletFor(6)).toEqual({ numNotes: 6, notesOccupied: 4 })
    expect(tupletFor(5)).toEqual({ numNotes: 5, notesOccupied: 4 })
    expect(tupletFor(7)).toEqual({ numNotes: 7, notesOccupied: 4 })
    expect(tupletFor(4)).toBeNull()
    expect(tupletFor(1)).toBeNull()
    expect(tupletFor(2)).toBeNull()
    expect(tupletFor(8)).toBeNull()
  })
})

describe('graceHands', () => {
  it('flam una, drag due, altrimenti nessuna', () => {
    expect(graceHands({ hand: 'R', accent: false, ornament: 'flam', graceHand: 'L' })).toEqual(['L'])
    expect(graceHands({ hand: 'R', accent: false, ornament: 'drag', graceHand: 'L' })).toEqual(['L', 'L'])
    expect(graceHands({ hand: 'R', accent: false, ornament: 'buzz' })).toEqual([])
    expect(graceHands({ hand: 'R', accent: false })).toEqual([])
  })
  it('senza graceHand esplicito, la mano dell acciaccatura e opposta a hand', () => {
    expect(graceHands({ hand: 'L', accent: false, ornament: 'flam' })).toEqual(['R'])
    expect(graceHands({ hand: 'L', accent: false, ornament: 'drag' })).toEqual(['R', 'R'])
  })
})

describe('planRepeat', () => {
  const ex = parseExercise({ id: 'x', name: 'x', timeSignature: [2, 4], steps: '>fR- dRLR | zR tL', repeats: 3 })
  const bars = planRepeat(ex, 1, 5)

  it('una BarPlan per battuta, una BeatPlan per movimento, note con durata e tuplet', () => {
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({ repeat: 1, bar: 0 })
    expect(bars[0].beats[0].notes.map((n) => n.duration)).toEqual(['8', '8'])
    expect(bars[0].beats[0].tuplet).toBeNull()
    expect(bars[0].beats[1].tuplet).toEqual({ numNotes: 3, notesOccupied: 2 })
    expect(bars[1].beats[0].notes[0].duration).toBe('q')
  })
  it('porta accento, sticking, acciaccature e ornamento', () => {
    const first = bars[0].beats[0].notes[0]
    expect(first).toEqual({ rest: false, duration: '8', accent: true, sticking: 'R', grace: ['L'], ornament: 'flam', slotIndex: 5 })
    expect(bars[0].beats[1].notes[0].grace).toEqual(['L', 'L'])
    expect(bars[1].beats[0].notes[0].ornament).toBe('buzz')
    expect(bars[1].beats[1].notes[0].ornament).toBe('tremolo')
  })
  it('le pause sono rest senza slot; gli slotIndex continuano da slotOffset saltandole', () => {
    expect(bars[0].beats[0].notes[1]).toEqual({ rest: true, duration: '8', accent: false, sticking: null, grace: [], ornament: null, slotIndex: null })
    const idx = bars.flatMap((b) => b.beats.flatMap((bt) => bt.notes.map((n) => n.slotIndex)))
    expect(idx).toEqual([5, null, 6, 7, 8, 9, 10])
  })
})

describe('planExercise', () => {
  it('srotola le ripetizioni continuando gli indici', () => {
    const ex = parseExercise({ id: 'x', name: 'x', timeSignature: [2, 4], steps: 'RL R-', repeats: 3 })
    const bars = planExercise(ex)
    expect(bars).toHaveLength(3)
    expect(bars.map((b) => b.repeat)).toEqual([0, 1, 2])
    expect(bars[2].beats[0].notes.map((n) => n.slotIndex)).toEqual([6, 7])
    expect(bars[2].beats[1].notes.map((n) => n.slotIndex)).toEqual([8, null])
  })
})

describe('tuplet su un movimento con una pausa interna', () => {
  it('il tuplet copre tutto il movimento (3 figure) anche se una e una pausa', () => {
    const ex = parseExercise({ id: 'x', name: 'x', timeSignature: [1, 4], steps: 'R-R', repeats: 1 })
    const [bar] = planRepeat(ex, 0, 0)
    const beat = bar.beats[0]
    expect(beat.tuplet).toEqual({ numNotes: 3, notesOccupied: 2 })
    expect(beat.notes).toHaveLength(3)
    expect(beat.notes.map((n) => n.duration)).toEqual(['8', '8', '8'])
    expect(beat.notes[1]).toMatchObject({ rest: true, duration: '8' })
    expect(beat.notes[0].rest).toBe(false)
    expect(beat.notes[2].rest).toBe(false)
  })
})

describe('contratto di ordinamento con buildGrid (il piu importante)', () => {
  it('planExercise emette gli stessi slotIndex, nello stesso ordine e con la stessa mano, di buildGrid', () => {
    // Sticking scelto apposta con pause, suddivisioni miste (4, 1, 5, 2), un gruppo irregolare (5),
    // ornamenti con acciaccatura (drag) e senza (buzz), accento, e piu' di una ripetizione:
    // se planRepeat si scostasse anche di una sola posizione dall'ordine di buildRepeat, questo test fallirebbe.
    const ex = parseExercise({
      id: 'contract',
      name: 'contract',
      timeSignature: [2, 4],
      steps: 'R-LR zR | >RLR-L dRL',
      repeats: 2,
    })
    const grid = buildGrid(ex, 120, 0)
    const plan = planExercise(ex)
    const planned = plan.flatMap((bar) => bar.beats.flatMap((bt) => bt.notes)).filter((n) => n.slotIndex !== null)

    expect(planned).toHaveLength(grid.slots.length)
    planned.forEach((n, i) => {
      expect(n.slotIndex).toBe(grid.slots[i].index)
      expect(n.sticking).toBe(grid.slots[i].step.hand)
    })
  })
})
