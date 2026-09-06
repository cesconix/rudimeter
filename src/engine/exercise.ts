import type { Exercise, ExerciseJson, Step, Subdivision } from './types'

const SUBDIV_VALUE: Record<string, number> = { '8': 8, '16': 16, '8t': 12 }

/** Quante figure di questa suddivisione stanno in una semibreve (terzine di ottavi = 12). */
export function subdivisionValue(s: Subdivision): number {
  return SUBDIV_VALUE[String(s)]
}

export function stepsPerBar(timeSignature: [number, number], subdivision: Subdivision): number {
  const [num, den] = timeSignature
  const v = (subdivisionValue(subdivision) * num) / den
  if (!Number.isInteger(v)) throw new Error(`suddivisione ${subdivision} non divide ${num}/${den}`)
  return v
}

export function parseSteps(text: string): Step[] {
  const steps: Step[] = []
  let accent = false
  for (const ch of text.replace(/\s+/g, '')) {
    if (ch === '>') {
      accent = true
      continue
    }
    if (ch === 'R' || ch === 'L') steps.push({ hand: ch, accent })
    else if (ch === '-') steps.push({ hand: null, accent: false })
    else throw new Error(`carattere non valido nello sticking: "${ch}"`)
    accent = false
  }
  if (accent) throw new Error('accento ">" senza colpo')
  return steps
}

export function parseExercise(json: ExerciseJson): Exercise {
  const steps = parseSteps(json.steps)
  const perBar = stepsPerBar(json.timeSignature, json.subdivision)
  if (steps.length === 0) throw new Error(`${json.id}: nessuno step`)
  if (steps.length % perBar !== 0) {
    throw new Error(`${json.id}: ${steps.length} step non riempiono battute intere di ${perBar}`)
  }
  if (!steps.some((s) => s.hand !== null)) throw new Error(`${json.id}: solo pause`)
  const repeats = json.repeats ?? 20
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`${json.id}: repeats non valido`)
  return {
    id: json.id,
    name: json.name,
    source: json.source,
    timeSignature: json.timeSignature,
    subdivision: json.subdivision,
    steps,
    repeats,
  }
}

export function barsOf(exercise: Exercise): number {
  return exercise.steps.length / stepsPerBar(exercise.timeSignature, exercise.subdivision)
}
