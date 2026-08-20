import type { ChunkCoord } from './chunkGrid'
import { CROP_DEFS, CROP_IDS, type CropId, type CropPlacement, rollCropPhase } from '../world/cropLifecycle'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt } from './biomeRegions'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
} from './chunkHeightmap'

/** Independent candidate pool, own RNG salt/id prefix (plan 172) — same
 *  worker-safe/deterministic contract as `chunkItems.ts`'s flora pool, kept
 *  in its own module because crops carry lifecycle state (`stageStartedAt`)
 *  instead of being a plain finite `ItemPlacement`. */
const CROP_CANDIDATES_PER_CHUNK = 2
const SLOPE_SAMPLE_STEP = 1.5
const SLOPE_REJECT = 0.9
/** Scales the summed weight into an overall spawn chance — wild carrot/potato/
 *  cabbage patches should read as a scattered find on open ground, not a
 *  carpet (mirrors `chunkItems.ts`'s `FLORA_KEEP_SCALE`). */
const CROP_KEEP_SCALE = 0.16

function hashChunk(cx: number, cz: number): number {
  let h = (cx * 668265263 + cz * 374761393) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Deterministic, worker-safe per-chunk wild-crop placement — same pattern as
 * `computeChunkItems`'s flora pool, but each placement carries lifecycle
 * state (`cropId` + `stageStartedAt`) instead of being a plain finite pickup.
 * Wild carrot/potato/cabbage favor open, temperate ground: not desert, not
 * swamp, not deep forest canopy, not mountain ridge, not high altitude.
 */
export function computeChunkCrops(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
): CropPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, waterLevel, heightScale, region } = params
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, params.resolution)
  const random = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0xc90f1)

  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

  const placements: CropPlacement[] = []
  const half = chunkSize / 2

  for (let i = 0; i < CROP_CANDIDATES_PER_CHUNK; i++) {
    const localX = (random() * 2 - 1) * half
    const localZ = (random() * 2 - 1) * half
    const wx = coord.cx * chunkSize + localX
    const wz = coord.cz * chunkSize + localZ

    const h = sample(tile.heights, wx, wz)
    if (h <= waterLevel + 0.3) continue // underwater/shoreline

    const d = SLOPE_SAMPLE_STEP
    const slope =
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    if (slope > SLOPE_REJECT) continue // cliff/steep face

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const ridge = sample(tile.mountainRidge, wx, wz)

    const openGroundWeight =
      (1 - biome.desert) *
      (1 - biome.swamp) *
      Math.max(0, 1 - biome.forest * 0.85) *
      (ridge < 0.25 ? 1 : Math.max(0, 1 - (ridge - 0.25) * 2)) *
      (altitude < 0.4 ? 1 : Math.max(0, 1 - (altitude - 0.4) * 2))
    if (openGroundWeight <= 0) continue
    if (random() > Math.min(1, openGroundWeight) * CROP_KEEP_SCALE) continue

    const cropId = CROP_IDS[Math.floor(random() * CROP_IDS.length)] as CropId
    const def = CROP_DEFS[cropId]
    const stageStartedAt = -rollCropPhase(def, random())

    placements.push({ id: `${coord.cx}:${coord.cz}:crop${i}`, x: wx, z: wz, cropId, stageStartedAt })
  }

  return placements
}
