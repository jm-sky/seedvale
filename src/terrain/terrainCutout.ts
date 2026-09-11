/** Persistent system terrain cutouts — real holes in the rendered chunk
 *  surface (plan world-terrain-019 Milestone B: the cave mouth aperture).
 *
 *  A cutout is a narrow terrain-facing descriptor: an id, XZ bounds and an
 *  `openingAt(x, z)` predicate that is positive exactly where the terrain
 *  sheet must be absent. `ChunkManager` retains registered cutouts for its
 *  own lifetime and applies them on *every* chunk mesh build/rebuild
 *  (initial load, reload after unload, dig/scorch/prepare re-mesh), so the
 *  hole is chunk-lifecycle state rather than an edit of whichever
 *  `BufferGeometry` happens to be loaded.
 *
 *  This is presentation topology only. Terrain height sampling / collision
 *  (`sampleHeight`, `heights`) is untouched — what happens below the hole is
 *  owned by whoever registered the cutout (the cave's own spatial queries).
 *
 *  The worker-computed `ChunkMeshData` (per-node Y / normal / colour /
 *  bare-ground) does not depend on cutouts, so the mesh-data cache and its
 *  key are unaffected; the cut index and contour vertices are assembled on
 *  the main thread from the cached node attributes.
 *
 * @domain world-terrain
 */

import type { ChunkMeshData } from './chunkMeshData'
import { CELL_RING, marchCellRing } from './gridContour'

export type TerrainCutoutBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type TerrainCutout = {
  /** Stable identity (e.g. `cave:<caveId>`) — diagnostics only. */
  id: string
  /** World XZ box outside of which `openingAt` is guaranteed `<= 0`. */
  bounds: TerrainCutoutBounds
  /** `> 0` where the terrain surface must be absent, `<= 0` where it is
   *  kept; the `0` crossing is the exact hole contour. Must be
   *  deterministic and cheap — it is evaluated per terrain grid node inside
   *  `bounds` (plus one grid step) on every mesh build of an overlapping
   *  chunk. */
  openingAt: (x: number, z: number) => number
  /** Optional exact surface height on the contour. When present, contour
   *  vertices take this Y instead of the lerp between the two grid nodes, so
   *  the terrain edge meets whatever the owner builds along the same line
   *  (the cave's open-sky rim sits on its walk surface) instead of hanging
   *  up to a grid step's worth of slope error above or below it. Only ever
   *  evaluated on contour vertices. */
  surfaceYAt?: (x: number, z: number) => number
}

/** Attributes for a chunk mesh with cutouts applied — the regular grid's
 *  nodes first (same order as `ChunkMeshData`), then the contour vertices
 *  that lie on cut cell edges. Chunk-local XZ like `PlaneGeometry`. */
export type CutChunkAttributes = {
  position: Float32Array
  normal: Float32Array
  color: Float32Array
  bareGround: Float32Array
  /** `PlaneGeometry`'s own UV layout (`u = ix / segments`, `v = 1 - iz /
   *  segments`), so the shared terrain material's detail normal map samples
   *  identically to an uncut chunk. */
  uv: Float32Array
  index: Uint32Array
  /** Cells that were partially or fully removed. */
  cutCellCount: number
  /** Vertices created on the `openingAt = 0` contour. */
  contourVertexCount: number
}

/** Cutouts whose bounds (grown by one grid step so a crossing edge's outer
 *  node is still evaluated) intersect the chunk square centred on
 *  `(chunkOriginX, chunkOriginZ)`. */
export function cutoutsOverlappingChunk(
  cutouts: readonly TerrainCutout[],
  chunkOriginX: number,
  chunkOriginZ: number,
  chunkSize: number,
  step: number,
): TerrainCutout[] {
  if (cutouts.length === 0) return []
  const half = chunkSize / 2
  const minX = chunkOriginX - half - step
  const maxX = chunkOriginX + half + step
  const minZ = chunkOriginZ - half - step
  const maxZ = chunkOriginZ + half + step
  const out: TerrainCutout[] = []
  for (const cutout of cutouts) {
    const b = cutout.bounds
    if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue
    out.push(cutout)
  }
  return out
}

/** Bisection steps for the contour crossing on a cut edge. The terrain grid
 *  (~1 m) is far coarser than the cave heightfield (0.3 m), so a plain lerp
 *  between node values can miss the true `openingAt = 0` line by a good
 *  fraction of a metre; 6 halvings put the terrain edge within ~1.5 cm of it
 *  at the cost of 6 predicate evaluations per contour vertex. */
const CROSSING_REFINE_STEPS = 6

/** `t ∈ [0, 1]` along an edge from `a` (opening `oa`) to `b` (`ob`) where the
 *  true predicate crosses zero. Falls back to the node lerp when the two
 *  ends do not straddle zero (degenerate / exactly-zero node). */
function refineCrossing(
  openingAt: (s: number) => number,
  oa: number,
  ob: number,
  lerpT: number,
): number {
  if (!((oa > 0) !== (ob > 0))) return lerpT
  let lo = 0
  let hi = 1
  let oLo = oa
  for (let i = 0; i < CROSSING_REFINE_STEPS; i++) {
    const mid = (lo + hi) * 0.5
    const oMid = openingAt(mid)
    if ((oMid > 0) === (oLo > 0)) {
      lo = mid
      oLo = oMid
    } else {
      hi = mid
    }
  }
  return (lo + hi) * 0.5
}

/**
 * Builds a chunk's render attributes with `cutouts` removed. Nodes inside a
 * cutout's grown bounds get `keep = -max(openingAt)`; every other node is
 * kept. Cells whose four corners are all kept emit `PlaneGeometry`'s own two
 * triangles; cells touched by a cutout are clipped by marching squares on
 * `keep`, so the terrain stops on the `openingAt = 0` contour with new
 * vertices on the cut edges — the crossing is bisected on the real predicate
 * (`refineCrossing`), and position, normal, colour, bare-ground and uv are
 * lerped from the two nodes at that parameter. Two chunks sharing an edge
 * evaluate identical node values, so the contour is continuous across chunk
 * boundaries.
 *
 * Deterministic for identical inputs — a rebuild always reproduces the same
 * hole.
 *
 * @domain world-terrain
 */
export function buildCutChunkAttributes(
  meshData: ChunkMeshData,
  resolution: number,
  chunkSize: number,
  chunkOriginX: number,
  chunkOriginZ: number,
  cutouts: readonly TerrainCutout[],
): CutChunkAttributes {
  const step = chunkSize / (resolution - 1)
  const half = chunkSize / 2
  const count = resolution * resolution
  const localX = (ix: number): number => ix * step - half
  const localZ = (iz: number): number => iz * step - half
  const segments = resolution - 1

  // keep > 0: terrain present. Evaluated only where a cutout can bite; a
  // node no cutout reaches is plainly kept. Evaluated nodes take the *true*
  // `-openingAt` (min across cutouts), never a clamped placeholder, so the
  // contour interpolation matches the cave mesher's exactly.
  const keep = new Float32Array(count).fill(Infinity)
  for (const cutout of cutouts) {
    const b = cutout.bounds
    const minIx = Math.max(0, Math.floor((b.minX - step - chunkOriginX + half) / step))
    const maxIx = Math.min(resolution - 1, Math.ceil((b.maxX + step - chunkOriginX + half) / step))
    const minIz = Math.max(0, Math.floor((b.minZ - step - chunkOriginZ + half) / step))
    const maxIz = Math.min(resolution - 1, Math.ceil((b.maxZ + step - chunkOriginZ + half) / step))
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const i = iz * resolution + ix
        const opening = cutout.openingAt(chunkOriginX + localX(ix), chunkOriginZ + localZ(iz))
        const v = -opening
        if (v < keep[i]!) keep[i] = v
      }
    }
  }
  for (let i = 0; i < count; i++) if (keep[i] === Infinity) keep[i] = 1

  const position: number[] = new Array(count * 3)
  const normal: number[] = new Array(count * 3)
  const color: number[] = new Array(count * 3)
  const bareGround: number[] = new Array(count)
  const uv: number[] = new Array(count * 2)
  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const i = iz * resolution + ix
      position[i * 3] = localX(ix)
      position[i * 3 + 1] = meshData.positionY[i]!
      position[i * 3 + 2] = localZ(iz)
      normal[i * 3] = meshData.normal[i * 3]!
      normal[i * 3 + 1] = meshData.normal[i * 3 + 1]!
      normal[i * 3 + 2] = meshData.normal[i * 3 + 2]!
      color[i * 3] = meshData.color[i * 3]!
      color[i * 3 + 1] = meshData.color[i * 3 + 1]!
      color[i * 3 + 2] = meshData.color[i * 3 + 2]!
      bareGround[i] = meshData.bareGround[i]!
      uv[i * 2] = ix / segments
      uv[i * 2 + 1] = 1 - iz / segments
    }
  }

  const openingAtWorld = (x: number, z: number): number => {
    let opening = -Infinity
    for (const cutout of cutouts) {
      const o = cutout.openingAt(x, z)
      if (o > opening) opening = o
    }
    return opening
  }
  /** Exact contour height from the cutout that owns this crossing (the one
   *  most open there), or `null` to keep the node lerp. */
  const contourSurfaceY = (x: number, z: number): number | null => {
    let owner: TerrainCutout | null = null
    let opening = -Infinity
    for (const cutout of cutouts) {
      const o = cutout.openingAt(x, z)
      if (o > opening) {
        opening = o
        owner = cutout
      }
    }
    return owner?.surfaceYAt ? owner.surfaceYAt(x, z) : null
  }

  // Two contour slots per node: 0 = edge to +X neighbour, 1 = edge to +Z.
  const edgeVertex = new Int32Array(count * 2).fill(-1)
  let contourVertexCount = 0
  const edgeVertexAt = (ixA: number, izA: number, ixB: number, izB: number, lerpT: number): number => {
    const along = ixB > ixA || izB > izA
    const loIx = along ? ixA : ixB
    const loIz = along ? izA : izB
    const key = (loIz * resolution + loIx) * 2 + (ixA === ixB ? 1 : 0)
    let v = edgeVertex[key]!
    if (v >= 0) return v
    const ia = izA * resolution + ixA
    const ib = izB * resolution + ixB
    const t = refineCrossing(
      (s) => openingAtWorld(
        chunkOriginX + localX(ixA) + (localX(ixB) - localX(ixA)) * s,
        chunkOriginZ + localZ(izA) + (localZ(izB) - localZ(izA)) * s,
      ),
      -keep[ia]!,
      -keep[ib]!,
      lerpT,
    )
    v = position.length / 3
    const px = localX(ixA) + (localX(ixB) - localX(ixA)) * t
    const pz = localZ(izA) + (localZ(izB) - localZ(izA)) * t
    const exactY = contourSurfaceY(chunkOriginX + px, chunkOriginZ + pz)
    position.push(
      px,
      exactY ?? meshData.positionY[ia]! + (meshData.positionY[ib]! - meshData.positionY[ia]!) * t,
      pz,
    )
    const nx = meshData.normal[ia * 3]! + (meshData.normal[ib * 3]! - meshData.normal[ia * 3]!) * t
    const ny = meshData.normal[ia * 3 + 1]! + (meshData.normal[ib * 3 + 1]! - meshData.normal[ia * 3 + 1]!) * t
    const nz = meshData.normal[ia * 3 + 2]! + (meshData.normal[ib * 3 + 2]! - meshData.normal[ia * 3 + 2]!) * t
    const nLen = Math.hypot(nx, ny, nz) || 1
    normal.push(nx / nLen, ny / nLen, nz / nLen)
    for (let k = 0; k < 3; k++) {
      color.push(meshData.color[ia * 3 + k]! + (meshData.color[ib * 3 + k]! - meshData.color[ia * 3 + k]!) * t)
    }
    bareGround.push(meshData.bareGround[ia]! + (meshData.bareGround[ib]! - meshData.bareGround[ia]!) * t)
    uv.push(
      uv[ia * 2]! + (uv[ib * 2]! - uv[ia * 2]!) * t,
      uv[ia * 2 + 1]! + (uv[ib * 2 + 1]! - uv[ia * 2 + 1]!) * t,
    )
    edgeVertex[key] = v
    contourVertexCount++
    return v
  }
  const nodeVertexAt = (ix: number, iz: number): number => iz * resolution + ix

  const index: number[] = []
  const ring: number[] = []
  let cutCellCount = 0
  for (let iz = 0; iz + 1 < resolution; iz++) {
    for (let ix = 0; ix + 1 < resolution; ix++) {
      let kept = 0
      for (const [dx, dz] of CELL_RING) {
        if (keep[(iz + dz) * resolution + (ix + dx)]! > 0) kept++
      }
      if (kept === 4) {
        // Same diagonal + winding as `THREE.PlaneGeometry` after
        // `rotateX(-PI/2)` (faces +Y), so an uncut cell is byte-identical
        // to the regular path.
        const a = iz * resolution + ix
        const b = (iz + 1) * resolution + ix
        const c = (iz + 1) * resolution + ix + 1
        const d = iz * resolution + ix + 1
        index.push(a, b, d, b, c, d)
        continue
      }
      cutCellCount++
      if (kept === 0) continue
      marchCellRing((cx, cz) => keep[cz * resolution + cx]!, ix, iz, nodeVertexAt, edgeVertexAt, ring)
      // Fan from the first ring entry: CCW from above, faces +Y.
      for (let k = 1; k + 1 < ring.length; k++) index.push(ring[0]!, ring[k]!, ring[k + 1]!)
    }
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    color: new Float32Array(color),
    bareGround: new Float32Array(bareGround),
    uv: new Float32Array(uv),
    index: new Uint32Array(index),
    cutCellCount,
    contourVertexCount,
  }
}
