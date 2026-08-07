import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt } from './biomeRegions'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
} from './chunkHeightmap'

export type VegetationPlacement = {
  x: number
  z: number
  kind: 'tree' | 'bush' | 'cactus' | 'reed'
  /** Index into `TREE_SPECS`/`BUSH_SPECS`/`CACTUS_SPECS`/`REED_SPECS`
   *  (`props.ts`), resolved on the main thread. */
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
/** Reject candidates sitting on a road/path corridor (`tile.roadTint`, `chunkHeightmap.ts`). */
const ROAD_TINT_REJECT = 0.15

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

  const { chunkSize, resolution, waterLevel, heightScale, region } = params
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
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)

    // Reeds tolerate growing right at the waterline; everything else needs
    // to clear the shore like today.
    const waterClearance = biome.swamp > 0.4 ? 0.05 : 0.5
    if (h <= waterLevel + waterClearance) continue // underwater/shoreline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // cliff/steep face

    if (altitude > TREELINE_ALTITUDE) continue // above treeline

    const ridge = sample(tile.mountainRidge, wx, wz)
    if (ridge > MOUNTAIN_RIDGE_REJECT) continue // bare ridge crest

    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path corridor

    const moisture = sample(tile.biomes, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    // Denser on humid lowlands/coasts (continentalness near the coastal band),
    // sparser further inland/toward highlands; deserts thin out further still.
    const density =
      Math.max(0, Math.min(1, moisture * 0.7 + (1 - Math.abs(continentalness - 0.55)) * 0.3)) *
      (1 - biome.desert * 0.6)
    if (random() > density) continue

    let kind: VegetationPlacement['kind']
    if (biome.desert > 0.5 && random() < biome.desert) {
      kind = random() < 0.75 ? 'cactus' : 'bush'
    } else if (biome.swamp > 0.5 && random() < biome.swamp) {
      kind = random() < 0.8 ? 'reed' : 'tree'
    } else {
      kind = random() < 0.15 + (1 - moisture) * 0.35 ? 'bush' : 'tree'
    }

    const speciesCount = params.vegetationSpeciesCount[kind]
    const speciesIndex = Math.floor(random() * Math.max(1, speciesCount))
    const scale = kind === 'bush' || kind === 'cactus' ? 0.6 + random() * 0.5 : 0.7 + random() * 0.6
    const rotationY = random() * Math.PI * 2

    placements.push({ x: wx, z: wz, kind, speciesIndex, scale, rotationY })
  }

  return placements
}
