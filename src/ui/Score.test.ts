import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../data/exercises'
import { buildGrid } from '../engine/grid'
import { planExercise } from '../notation/plan'

// `Score` usa `Slot.index` (engine/grid) come chiave in `RenderedScore.notes` (notation/render), le cui
// chiavi sono `slotIndex` di notation/plan. I due indici nascono dallo stesso esercizio ma attraversano
// moduli diversi (engine/grid vs notation/plan) e nessun test end-to-end aveva mai verificato, sui dati
// reali della libreria, che concordino: una divergenza colorerebbe la nota sbagliata (o nessuna) senza
// errori. Test puro, niente DOM/React: solo grid + plan.
describe('EXERCISES: gli slot sonori di engine/grid e gli slotIndex di notation/plan concordano', () => {
  for (const ex of EXERCISES) {
    it(`${ex.id}: stesso insieme di indici, nello stesso ordine, senza duplicati (pause escluse da entrambi)`, () => {
      const grid = buildGrid(ex, 120, 0)
      const plan = planExercise(ex)

      const gridIndexes = grid.slots.map((s) => s.index)
      const planIndexes = plan
        .flatMap((bar) => bar.beats.flatMap((beat) => beat.notes))
        .map((n) => n.slotIndex)
        .filter((i): i is number => i !== null)

      // Confronto sugli array ordinati (non su Set): un duplicato che coincidesse per caso con un
      // indice mancante altrove resterebbe invisibile a un confronto per insiemi.
      expect([...planIndexes].sort((a, b) => a - b)).toEqual([...gridIndexes].sort((a, b) => a - b))
      expect(new Set(gridIndexes).size).toBe(gridIndexes.length)
      expect(new Set(planIndexes).size).toBe(planIndexes.length)
    })
  }
})
