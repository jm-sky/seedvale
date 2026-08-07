import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
} from './chunkHeightmap'

export type VegetationPlacement = {
  x: number
  z: number
  kind: 'tree' | 'bush'
  /** Index into `TREE_SPECS`/`BUSH_SPECS` (`props.ts`), resolved on the main thread. */
  speciesIndex: number
  scale: number
  rotationY: number
}

const CANDIDATES_PER_CHUNK = 18
const SLOPE_SAMPLE_STEP = 1.5
/** Reject candidates on slopes steeper than this (roughly matches where
 *  `applySlopeRock` starts taking over visually). */
const SLOPE_REJECT = 0.9
/** Treeline — fraction of `heightScale` above `waterLevel` above which nothing grows. */
const TREELINE_ALTITUDE = 0.6
/** Reject candidates sitting on a strong mountain ridge crest, regardless of altitude. */
const MOUNTAIN_RIDGE_REJECT = 0.35

/** Per-chunk hash so nearby chunks don't get correlated candidate layouts. */
function hashChunk(cx: number, cz: number): number {
  let h = (cx * 374761393 + cz * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Deterministic, worker-safe per-chunk vegetation placement — pure data only
 * (no `THREE.Object3D`/GLTF; workers can't touch either), instantiated into
 * actual meshes on the main thread (`chunkManager.ts`). Density/species mix is
 * driven by the same macro region values (`continentalness`, `mountainRidge`)
 * added for terrain shaping, so forests naturally thin out toward highlands/
 * mountains and stop at the shoreline/treeline. Callers skip this for pinned
 * `homeChunks` — the settlement keeps its own bespoke layout (`props.ts`).
 */
export function computeChunkVegetation(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
): VegetationPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, resolution, waterLevel, heightScale } = params
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, resolution)
  const random = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x76a5c)

  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

  const placements: VegetationPlacement[] = []
  const half = chunkSize / 2

  for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = coord.cx * chunkSize + localX
    const wz = coord.cz * chunkSize + localZ

    const h = sample(tile.heights, wx, wz)
    if (h <= waterLevel + 0.5) continue // underwater/shoreline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // cliff/steep face

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    const ridge = sample(tile.mountainRidge, wx, wz)
    if (ridge > MOUNTAIN_RIDGE_REJECT) continue // bare ridge crest

    const moisture = sample(tile.biomes, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    // Denser on humid lowlands/coasts (continentalness near the coastal band),
    // sparser further inland/toward highlands.
    const density = Math.max(
      0,
      Math.min(1, moisture * 0.7 + (1 - Math.abs(continentalness - 0.55)) * 0.3),
    )
    if (random() > density) continue

    const isBush = random() < 0.15 + (1 - moisture) * 0.35
    const kind: 'tree' | 'bush' = isBush ? 'bush' : 'tree'
    const speciesCount = isBush
      ? params.vegetationSpeciesCount.bush
      : params.vegetationSpeciesCount.tree
    const speciesIndex = Math.floor(random() * Math.max(1, speciesCount))
    const scale = isBush ? 0.6 + random() * 0.5 : 0.7 + random() * 0.6
    const rotationY = random() * Math.PI * 2

    placements.push({ x: wx, z: wz, kind, speciesIndex, scale, rotationY })
  }

  return placements
}
