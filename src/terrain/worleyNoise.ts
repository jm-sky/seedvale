export type WorleyRidgeResult = {
  /** Distance to the nearest feature point. */
  f1: number
  /** Distance to the second-nearest feature point. */
  f2: number
  /** 1 near a Voronoi cell boundary (equidistant from two feature points), 0 deep
   *  inside a cell. Boundaries form a connected line network across the whole
   *  plane — this is what produces connected mountain ridges/ranges rather than
   *  isolated cone-shaped peaks (which a plain "distance to nearest point" field
   *  would give). */
  ridge01: number
}

/** Deterministic per-cell hash → [0,1), no allocation, safe to call thousands of
 *  times per texel without RNG-object overhead. Integer mix (Wang-style). */
function hash01(ix: number, iz: number, salt: number): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

/** Per-cell feature-point jitter, within [0,1) of the cell — keeps the point
 *  inside its own cell (standard jittered-grid Worley), just not at the corner. */
function cellJitter(ix: number, iz: number, seed: number): [number, number] {
  return [hash01(ix, iz, seed ^ 0x1a2b3c4d), hash01(ix, iz, seed ^ 0x5e6f7089)]
}

/**
 * Classic jittered-grid Worley/cellular noise, 3×3 neighbor-cell scan (sufficient
 * for correct F1/F2 given jitter confined to one cell). Pure function of
 * `(x, z, cellSize, seed)` — no per-seed setup/cache needed (unlike simplex),
 * and safe across chunk boundaries by construction (continuous world-space input).
 */
export function worleyRidge(
  x: number,
  z: number,
  cellSize: number,
  seed: number,
  ridgeSharpness = 2,
): WorleyRidgeResult {
  const cx = Math.floor(x / cellSize)
  const cz = Math.floor(z / cellSize)

  let f1 = Infinity
  let f2 = Infinity

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx
      const iz = cz + dz
      const [jx, jz] = cellJitter(ix, iz, seed)
      const fx = (ix + jx) * cellSize
      const fz = (iz + jz) * cellSize
      const d = Math.hypot(x - fx, z - fz)
      if (d < f1) {
        f2 = f1
        f1 = d
      } else if (d < f2) {
        f2 = d
      }
    }
  }

  const ridge01 = Math.max(0, Math.min(1, 1 - ((f2 - f1) / cellSize) * ridgeSharpness))
  return { f1, f2, ridge01 }
}
