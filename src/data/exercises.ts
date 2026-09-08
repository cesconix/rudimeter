import { parseExercise } from '../engine/exercise'
import type { ExerciseJson } from '../engine/types'

export const EXERCISES_JSON: ExerciseJson[] = [
  { id: 'stone-1', name: 'Stick Control #1', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RL RL | RL RL', repeats: 20 },
  { id: 'stone-3', name: 'Stick Control #3', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RR LL | RR LL', repeats: 20 },
  { id: 'stone-5', name: 'Stick Control #5', source: 'Stick Control, p. 5', timeSignature: [2, 4], steps: 'RL RR | LR LL', repeats: 20 },
  // Studio di lettura, non di tecnica: Stone è tutto ottavi in 2/4, quindi sul rigo non compare mai
  // una figura diversa dall'altra. Qui in due battute passano quarto, ottavi, sedicesimi, terzina e
  // pause — di movimento, di ottavo e di sedicesimo — che è ciò che mette alla prova il disegno
  // (travi interrotte, parentesi di terzina, larghezze diverse nello stesso movimento) e la lettura.
  // Le mani alternano da sole; le pause spezzano l'alternanza, come in musica.
  {
    id: 'lettura-4-4',
    name: 'Lettura mista',
    source: 'studio',
    timeSignature: [4, 4],
    steps: '>R LR LRLR L- | >RLR -L R-LR -',
    repeats: 8,
  },
]

export const EXERCISES = EXERCISES_JSON.map(parseExercise)
