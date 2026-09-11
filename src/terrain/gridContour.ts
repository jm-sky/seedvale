/** Marching-squares contour helper shared by every regular-grid mesher that
 *  must stop on the *same* zero crossing: the cave heightfield floor/ceiling
 *  (`world/caves/caveHeightfieldMesh.ts`) and the terrain chunk cutout
 *  (`terrainCutout.ts`). Pure, no Three.js.
 *
 * @domain world-terrain
 */

/** Ring order of a cell's four corners, CCW seen from above. Verified
 *  against `computeVertexNormals()`'s `(C - B) x (A - B)`: a fan from the
 *  first entry yields +Y. */
export const CELL_RING: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
]

/**
 * Marching squares over one cell: walks `CELL_RING` and returns the polygon
 * of the `value > 0` region as vertex indices, emitting an inside corner
 * through `nodeVertex` and a `value = 0` crossing through `edgeVertex`.
 *
 * Shared by the cave mesher and the terrain cutout so both stop on the
 * *same* contour with the *same* linear interpolation. Dropping whole cells
 * instead over-cuts the terrain by up to a full cell past the contour, which
 * is what opened real side gaps around the mouth in the spike.
 *
 * Saddle cells (two inside corners on a diagonal) come back as one merged
 * polygon rather than two islands — a sub-cell artefact, not a hole.
 *
 * @domain world-terrain
 */
export function marchCellRing(
  valueAt: (ix: number, iz: number) => number,
  ix: number,
  iz: number,
  nodeVertex: (ix: number, iz: number) => number,
  edgeVertex: (ixA: number, izA: number, ixB: number, izB: number, t: number) => number,
  out: number[],
): void {
  out.length = 0
  for (let k = 0; k < CELL_RING.length; k++) {
    const [dxA, dzA] = CELL_RING[k]!
    const [dxB, dzB] = CELL_RING[(k + 1) % CELL_RING.length]!
    const ixA = ix + dxA
    const izA = iz + dzA
    const ixB = ix + dxB
    const izB = iz + dzB
    const va = valueAt(ixA, izA)
    const vb = valueAt(ixB, izB)
    if (va > 0) out.push(nodeVertex(ixA, izA))
    if ((va > 0) !== (vb > 0)) {
      const denom = va - vb
      const t = Math.abs(denom) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, va / denom))
      out.push(edgeVertex(ixA, izA, ixB, izB, t))
    }
  }
}
