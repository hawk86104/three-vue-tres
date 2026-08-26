/**
 * Deterministic PRNG. All generation draws from forks of one root Rng —
 * never Math.random() — so a given seed always assembles the identical scene.
 */

function hashLabel(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

export class Rng {
  readonly seed: number
  private s: number

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.s = this.seed === 0 ? 0x9e3779b9 : this.seed
  }

  /** Uniform in [0, 1). splitmix32. */
  next(): number {
    this.s = (this.s + 0x9e3779b9) >>> 0
    let z = this.s
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
    z ^= z >>> 15
    return (z >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  int(min: number, maxInclusive: number): number {
    return Math.min(maxInclusive, Math.floor(this.range(min, maxInclusive + 1)))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Gaussian-ish (sum of 3), mean 0, roughly unit spread. */
  spread(): number {
    return (this.next() + this.next() + this.next()) / 1.5 - 1
  }

  /**
   * Independent deterministic stream. Forks derive from the root seed and the
   * label only — draw order elsewhere can never shift a fork's sequence.
   */
  fork(label: string): Rng {
    return new Rng((hashLabel(label) ^ this.seed) >>> 0)
  }
}
