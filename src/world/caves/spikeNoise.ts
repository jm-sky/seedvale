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

function hashLattice2D(seed: number, cx: number, cz: number): number {
  let h = (seed ^ Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cz | 0, 0x165667b1)) >>> 0
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

/** `(x, z) => value in [-1, 1]`, 2D value noise on a square lattice of
 *  spacing `cellSize`, smoothstep-interpolated and seeded by `seed`.
 *
 *  Same construction as `createValueNoise1D`, one dimension up. Owned here
 *  so the cave heightfield representation does not carry a private copy.
 *
 * @domain world-terrain
 */
export function createValueNoise2D(seed: number, cellSize: number): (x: number, z: number) => number {
  const inv = 1 / cellSize
  return (x: number, z: number) => {
    const fx = x * inv
    const fz = z * inv
    const ix = Math.floor(fx)
    const iz = Math.floor(fz)
    const sx = smoothstep(fx - ix)
    const sz = smoothstep(fz - iz)
    const n00 = hashLattice2D(seed, ix, iz)
    const n10 = hashLattice2D(seed, ix + 1, iz)
    const n01 = hashLattice2D(seed, ix, iz + 1)
    const n11 = hashLattice2D(seed, ix + 1, iz + 1)
    const nx0 = n00 + (n10 - n00) * sx
    const nx1 = n01 + (n11 - n01) * sx
    return nx0 + (nx1 - nx0) * sz
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
