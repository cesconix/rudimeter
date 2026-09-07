import type { Bar, Beat, Hand, Ornament, Step } from './types'

export const MAX_SUBDIVISION = 8

const ORNAMENT: Record<string, Ornament> = { f: 'flam', d: 'drag', z: 'buzz', t: 'tremolo' }

/** `>`? poi uno fra f d z t? poi `(R|L)`? poi la mano o `-`. L'ordine è fisso. */
const TOKEN = /^(>)?([fdzt])?(?:\(([RL])\))?([RL-])$/

const opposite = (h: Hand): Hand => (h === 'R' ? 'L' : 'R')

/** Spezza un movimento ("RLRL", ">f(L)RLRR") nei suoi token: ogni token finisce con R, L o -. */
export function tokenize(group: string): string[] {
  const tokens: string[] = []
  let buf = ''
  let inParen = false
  for (const ch of group) {
    buf += ch
    if (ch === '(') inParen = true
    else if (ch === ')') inParen = false
    else if (!inParen && (ch === 'R' || ch === 'L' || ch === '-')) {
      tokens.push(buf)
      buf = ''
    }
  }
  if (buf) throw new Error(`token incompleto: "${buf}" in "${group}"`)
  return tokens
}

export function parseToken(tok: string): Step {
  const m = TOKEN.exec(tok)
  if (!m) throw new Error(`token non valido: "${tok}"`)
  const [, accent, orn, grace, hand] = m
  if (hand === '-') {
    if (accent || orn || grace) throw new Error(`la pausa non ammette prefissi: "${tok}"`)
    return { hand: null, accent: false }
  }
  const step: Step = { hand: hand as Hand, accent: accent === '>' }
  const ornament = orn ? ORNAMENT[orn] : undefined
  const hasGrace = ornament === 'flam' || ornament === 'drag'
  if (grace && !hasGrace) throw new Error(`mano dell'acciaccatura senza flam/drag: "${tok}"`)
  if (ornament) step.ornament = ornament
  if (hasGrace) step.graceHand = (grace as Hand | undefined) ?? opposite(step.hand as Hand)
  return step
}

export function parseBeat(group: string): Beat {
  const tokens = tokenize(group)
  if (tokens.length < 1 || tokens.length > MAX_SUBDIVISION) {
    throw new Error(`movimento "${group}": ${tokens.length} figure, ammesse 1-${MAX_SUBDIVISION}`)
  }
  return { steps: tokens.map(parseToken) }
}

/** DSL v2 → battute. Spazio = movimento, `|` = battuta. Ogni battuta deve avere `beatsPerBar` movimenti. */
export function parseSticking(text: string, beatsPerBar: number): Bar[] {
  const bars = text
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (bars.length === 0) throw new Error('sticking vuoto')
  return bars.map((barText, i) => {
    const groups = barText.split(/\s+/)
    if (groups.length !== beatsPerBar) throw new Error(`battuta ${i + 1}: ${groups.length} movimenti, attesi ${beatsPerBar}`)
    return { beats: groups.map(parseBeat) }
  })
}
