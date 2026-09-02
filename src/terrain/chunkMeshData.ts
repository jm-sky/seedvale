import * as THREE from 'three'
import {
  applyMicroTint,
  applyMountainRock,
  applyOceanDepthTint,
  applyRoadTint,
  applySlopeRock,
  colorForTerrain,
  sandBandAt,
} from './biomeColors'
import { biomeWeightsAt } from './biomeRegions'
import { apronGridWeights, type RegionParams, sampleApronGridWeighted } from './chunkHeightmap'

/** World-space burn patches applied as vertex-color charcoal (plan 137) —
 *  the same `{x,z,radius}` as `chunkManager.ts`'s `TerrainModification` mode
 *  `'scorch'`. Kept as a narrow type so this module doesn't import
 *  `chunkManager`. Re-exported by `buildChunkGeometry.ts` for callers that
 *  used to import it from there. */
export type TerrainScorchPatch = { x: number, z: number, radius: number }

/** Charcoal ground color for a fully-scorched vertex. */
export const SCORCH_CHARCOAL = new THREE.Color(0x1a1410)

/** Radial scorch amount in [0, 1] at a world XZ point — 1 at the center,
 *  0 at/beyond `radius`. Overlapping patches take the max. Pure/exported
 *  so the falloff is unit-tested without building a chunk mesh. */
export function scorchFalloffAt(
  wx: number,
  wz: number,
  patches: readonly TerrainScorchPatch[],
): number {
  let best = 0
  for (const patch of patches) {
    const dist = Math.hypot(wx - patch.x, wz - patch.z)
    if (dist >= patch.radius) continue
    const falloff = 1 - THREE.MathUtils.smoothstep(dist, 0, patch.radius)
    if (falloff > best) best = falloff
  }
  return best
}

/** Apron-inclusive terrain grids `computeChunkMeshData` samples — the subset
 *  of `ChunkTileData` (`chunkHeightmap.ts`) that feeds render mesh output.
 *  Passed structured-clone (not transferred) into the `'mesh'` worker job, so
 *  the caller (`chunkManager.ts`) keeps its own copy for sampling/collision —
 *  same reasoning as `GrassRequestParams.grids` (`chunkHeightmapProtocol.ts`). */
export type ChunkMeshTileGrids = {
  floorHeights: Float32Array
  biomes: Float32Array
  continentalness: Float32Array
  mountainRidge: Float32Array
  moistureRegion: Float32Array
  roadTint: Float32Array
}

/** Worker-computed, data-only render mesh attributes for one chunk's core
 *  (resolution × resolution) grid — row-major `iz * resolution + ix`, the
 *  same vertex order `THREE.PlaneGeometry(chunkSize, chunkSize, resolution-1,
 *  resolution-1)` produces after `rotateX(-PI/2)` (verified against three's
 *  own `PlaneGeometry` vertex generation). `buildChunkGeometry.ts` is the
 *  only consumer; it never recomputes these values, only assembles Three.js
 *  objects from them (plan world-terrain-004). */
export type ChunkMeshData = {
  /** Render Y (from `floorHeights` — true bathymetry, not the clamped `heights`
   *  water mask). */
  positionY: Float32Array
  /** Central-difference normals on the apron-inclusive floor grid, length `3 * count`. */
  normal: Float32Array
  /** Vertex colors, length `3 * count`. */
  color: Float32Array
  /** `aBareGround` shader attribute, length `count`. */
  bareGround: Float32Array
}

export type ChunkMeshDataParams = {
  tile: ChunkMeshTileGrids
  resolution: number
  chunkSize: number
  /** World-space chunk center — needed for `sandBandAt`/`applyMicroTint`/
   *  `applyRoadTint`/`scorchFalloffAt`, which are all deterministic functions
   *  of world position, not chunk-local position. */
  chunkOriginX: number
  chunkOriginZ: number
  waterLevel: number
  heightScale: number
  region: RegionParams
  seed: number
  scorches: readonly TerrainScorchPatch[]
}

/** Grid indices of the apron texel nearest `(x, z)` — every core vertex lands
 *  exactly on an apron grid point (the apron is the same step spacing, one
 *  ring wider), so this is exact, not a nearest-neighbor approximation. */
function apronGridIJ(
  apronRes: number,
  apronOriginX: number,
  apronOriginZ: number,
  step: number,
  x: number,
  z: number,
): { ix: number, iz: number } {
  return {
    ix: Math.max(0, Math.min(apronRes - 1, Math.round((x - apronOriginX) / step))),
    iz: Math.max(0, Math.min(apronRes - 1, Math.round((z - apronOriginZ) / step))),
  }
}

/**
 * Computes one chunk's render mesh data from its apron-inclusive tile grids
 * — the data-only extraction of what used to be `buildChunkGeometry()`'s
 * per-vertex loop (plan world-terrain-004), safe to run inside
 * `chunkHeightmap.worker.ts`. Vertex Y/normals/shore-seabed colour use
 * `tile.floorHeights` (true bathymetry) so underwater terrain is a bathtub
 * under the water plane, not a flat lid at `waterLevel`.
 *
 * Normals are central differences on that same floor grid (the apron ring
 * exists so every core-edge vertex has a same-grid neighbor on both sides of
 * the seam) — mathematically identical to `computeVertexNormals()` on this
 * grid's regular triangulation, but without allocating and immediately
 * discarding a helper `PlaneGeometry` per chunk. `computeVertexNormals()`
 * must NOT be called on the core geometry itself, since that would recompute
 * from core-only faces and reintroduce the seam mismatch the apron exists to
 * avoid.
 */
export function computeChunkMeshData(params: ChunkMeshDataParams): ChunkMeshData {
  const {
    tile,
    resolution,
    chunkSize,
    chunkOriginX: worldOriginX,
    chunkOriginZ: worldOriginZ,
    waterLevel,
    heightScale,
    region,
    seed,
    scorches,
  } = params
  const step = chunkSize / (resolution - 1)
  const apronRes = resolution + 2
  const apronOriginX = -chunkSize / 2 - step
  const apronOriginZ = -chunkSize / 2 - step

  const count = resolution * resolution
  const positionY = new Float32Array(count)
  const normal = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const bareGround = new Float32Array(count)
  const tmp = new THREE.Color()

  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const i = iz * resolution + ix
      // Regular grid matching THREE.PlaneGeometry's own vertex layout after
      // rotateX(-PI/2): x = ix*step - chunkSize/2, z = iz*step - chunkSize/2.
      const x = ix * step - chunkSize / 2
      const z = iz * step - chunkSize / 2

      // One set of bilinear weights per vertex, reused for all apron-grid
      // samples below instead of each recomputing fx/fz/floor/clamp from scratch.
      const w = apronGridWeights(apronRes, apronOriginX, apronOriginZ, step, x, z)
      const h = sampleApronGridWeighted(tile.floorHeights, apronRes, w)
      positionY[i] = h

      const { ix: aix, iz: aiz } = apronGridIJ(apronRes, apronOriginX, apronOriginZ, step, x, z)
      const hE = tile.floorHeights[aiz * apronRes + Math.min(apronRes - 1, aix + 1)]!
      const hW = tile.floorHeights[aiz * apronRes + Math.max(0, aix - 1)]!
      const hN = tile.floorHeights[Math.min(apronRes - 1, aiz + 1) * apronRes + aix]!
      const hS = tile.floorHeights[Math.max(0, aiz - 1) * apronRes + aix]!
      const dHdx = (hE - hW) / (2 * step)
      const dHdz = (hN - hS) / (2 * step)
      const nLen = Math.hypot(dHdx, 1, dHdz)
      const ny = 1 / nLen
      normal[i * 3] = -dHdx / nLen
      normal[i * 3 + 1] = ny
      normal[i * 3 + 2] = -dHdz / nLen

      const m = sampleApronGridWeighted(tile.biomes, apronRes, w)
      const continentalness = sampleApronGridWeighted(tile.continentalness, apronRes, w)
      const mountainRidge = sampleApronGridWeighted(tile.mountainRidge, apronRes, w)
      const moistureRegion = sampleApronGridWeighted(tile.moistureRegion, apronRes, w)
      const roadTint = sampleApronGridWeighted(tile.roadTint, apronRes, w)
      const steepness = 1 - ny
      const altitude01 = (h - waterLevel) / Math.max(heightScale, 0.001)
      const biomeWeights = biomeWeightsAt(moistureRegion, altitude01, region)
      const wx = worldOriginX + x
      const wz = worldOriginZ + z
      const sandBand = sandBandAt(wx, wz, seed)

      colorForTerrain(h, m, waterLevel, heightScale, biomeWeights, tmp, sandBand)
      applySlopeRock(tmp, h, waterLevel, steepness, sandBand)
      applyMountainRock(tmp, mountainRidge, h, waterLevel, heightScale)
      applyOceanDepthTint(tmp, continentalness, h, waterLevel)
      applyMicroTint(tmp, h, waterLevel, wx, wz, 0.045 + Math.min(1, roadTint) * 0.05)
      applyRoadTint(tmp, roadTint, wx, wz)
      const scorchAmt = scorchFalloffAt(wx, wz, scorches)
      if (scorchAmt > 0) {
        tmp.lerp(SCORCH_CHARCOAL, scorchAmt)
      }

      color[i * 3] = tmp.r
      color[i * 3 + 1] = tmp.g
      color[i * 3 + 2] = tmp.b
      bareGround[i] = Math.max(
        bareGroundWeight(roadTint, h, waterLevel, biomeWeights.desert, sandBand),
        scorchAmt,
      )
    }
  }

  return { positionY, normal, color, bareGround }
}

/** Where the surface reads as packed dirt/sand rather than vegetated ground:
 *  road & village-clearing corridors (`tile.roadTint`), the shore sand band,
 *  and desert regions. Drives the tiling blend in `buildChunkGeometry.ts`'s
 *  shared terrain material. */
function bareGroundWeight(
  roadTint: number,
  height: number,
  waterLevel: number,
  desert: number,
  sandBand: number,
): number {
  // `applyRoadTint` saturates toward dirt; keep a longer mixed band so the
  // soft corridor edge still shows meadow normals/color before full bare grain.
  const road = Math.min(1, Math.pow(Math.max(0, roadTint), 0.85) * 1.35)
  const sand =
    1 -
    THREE.MathUtils.smoothstep(height, waterLevel + sandBand * 0.5, waterLevel + sandBand * 1.5)
  return Math.min(1, Math.max(road, sand, desert))
}
