/** mulberry32: a 32-bit seeded generator, tiny and good enough for a drummer. Returns uniforms in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mixes two integers into one 32-bit seed. Not symmetric: (1, 2) and (2, 1) must not collide. */
export function hashPair(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2f)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * One generator per (seed, index): the draws of a slot do not depend on how many slots came before
 * it, so a grid replanned by the auto-increment gives the slots it keeps exactly the strokes they had.
 */
export function rngFor(seed: number, index: number): () => number {
  return mulberry32(hashPair(seed, index))
}

/** Standard normal from two uniforms (Box–Muller). `1 - u` keeps the log away from zero. */
export function gaussian(rng: () => number): number {
  const u = 1 - rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
