/** Deterministic 1D value noise for the cave spikes — hashed lattice points
 *  + smoothstep interpolation. Not a general noise library, just enough for
 *  arc-length/angle-parameterised multi-scale surface deformation while
 *  keeping every spike stream reproducible from `(seed, purpose)` alone
 *  (plan world-terrain-008, "Determinism" — one stream per purpose, never a
 *  shared stream consumed in a call-order-dependent way).
 *
 * @domain world-terrain
 */

function hashLatticePoint(seed: number, cell: number): number {
  let h = (seed ^ Math.imul(cell | 0, 0x27d4eb2d)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h / 4294967296) * 2 - 1
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** `(s) => value in [-1, 1]`, 1D value noise with lattice spacing `cellSize`
 *  along the input domain, seeded by `seed`. */
export function createValueNoise1D(seed: number, cellSize: number): (s: number) => number {
  return (s: number) => {
    const cell = Math.floor(s / cellSize)
    const t = s / cellSize - cell
    const a = hashLatticePoint(seed, cell)
    const b = hashLatticePoint(seed, cell + 1)
    return a + (b - a) * smoothstep(t)
  }
}

export type NoiseOctave = { cellSize: number, amplitude: number }

/** Sum of several `createValueNoise1D` octaves — the "multi-scale
 *  deformation" the plan asks for (micro ~0.3-0.6 m, medium ~1-2 m, larger
 *  ~2 m+), never a single random pass. */
export function createMultiScaleNoise1D(seed: number, octaves: readonly NoiseOctave[]): (s: number) => number {
  const layers = octaves.map((o, i) => ({
    noise: createValueNoise1D((seed + i * 0x1000193) >>> 0, o.cellSize),
    amplitude: o.amplitude,
  }))
  return (s: number) => layers.reduce((sum, l) => sum + l.noise(s) * l.amplitude, 0)
}
