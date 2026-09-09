import type { Bar, Beat, Hand, Ornament, Step } from './types'

const MAX_SUBDIVISION = 8

const ORNAMENT: Record<string, Ornament> = { f: 'flam', d: 'drag', z: 'buzz', t: 'tremolo' }

/** `>`? then one of f d z t? then `(R|L)`? then the hand or `-`. The order is fixed. */
const TOKEN = /^(>)?([fdzt])?(?:\(([RL])\))?([RL-])$/

const opposite = (h: Hand): Hand => (h === 'R' ? 'L' : 'R')

/** Splits a beat ("RLRL", ">f(L)RLRR") into its tokens: every token ends with R, L or -. */
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
  if (buf) throw new Error(`incomplete token: "${buf}" in "${group}"`)
  return tokens
}

export function parseToken(tok: string): Step {
  const m = TOKEN.exec(tok)
  if (!m) throw new Error(`invalid token: "${tok}"`)
  const [, accent, orn, grace, hand] = m
  if (hand === '-') {
    if (accent || orn || grace) throw new Error(`a rest takes no prefix: "${tok}"`)
    return { hand: null, accent: false }
  }
  const step: Step = { hand: hand as Hand, accent: accent === '>' }
  const ornament = orn ? ORNAMENT[orn] : undefined
  const hasGrace = ornament === 'flam' || ornament === 'drag'
  if (grace && !hasGrace) throw new Error(`grace hand without flam/drag: "${tok}"`)
  if (ornament) step.ornament = ornament
  if (hasGrace) step.graceHand = (grace as Hand | undefined) ?? opposite(step.hand as Hand)
  return step
}

export function parseBeat(group: string): Beat {
  const tokens = tokenize(group)
  if (tokens.length < 1 || tokens.length > MAX_SUBDIVISION) {
    throw new Error(`beat "${group}": ${tokens.length} notes, allowed 1-${MAX_SUBDIVISION}`)
  }
  return { steps: tokens.map(parseToken) }
}

/** DSL v2 → bars. Space = beat, `|` = bar. Every bar must have `beatsPerBar` beats. */
export function parseSticking(text: string, beatsPerBar: number): Bar[] {
  const segments = text.split('|').map((s) => s.trim())

  // All segments are empty: treat as whole-sticking error
  if (segments.every((s) => s.length === 0)) throw new Error('empty sticking')

  // Map segments to bars, validating each one
  return segments.map((barText, i) => {
    // Individual segment is empty: error
    if (barText.length === 0) throw new Error(`bar ${i + 1}: empty`)

    const groups = barText.split(/\s+/)
    if (groups.length !== beatsPerBar) throw new Error(`bar ${i + 1}: ${groups.length} beats, expected ${beatsPerBar}`)
    return { beats: groups.map(parseBeat) }
  })
}
