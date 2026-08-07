import type { ItemKind } from '../items/items'
import type { ChunkCoord } from './chunkGrid'
import { createSeededRandom } from '../world/parseSeed'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
} from './chunkHeightmap'

export type ItemPlacement = {
  /** Stable, deterministic (`cx:cz:localIndex`) — not random. Lets the save file
   *  track *only* collected ids instead of full item state; see `chunkManager.ts`. */
  id: string
  x: number
  z: number
  kind: ItemKind
}

const CANDIDATES_PER_CHUNK = 3
const SLOPE_SAMPLE_STEP = 1.5
/** Reuses `chunkVegetation.ts`'s slope-reject threshold — no cliffside pickups. */
const SLOPE_REJECT = 0.9
/** Ridge strength above which a candidate counts as "in the mountains" for stone
 *  placement — lower than the terrain-shaping `mountainThreshold` so foothills
 *  qualify too, not just bare ridge crests. */
const MOUNTAIN_ITEM_MIN_RIDGE = 0.35
/** Max local height above `waterLevel` for shell placement, in world units
 *  (heightScale default 18). `continentalness` alone is too low-frequency to
 *  guarantee a spot is actually near the shoreline — a "coastal band" point can
 *  still sit high and dry deep inland (e.g. in a forest). This keeps shells tied
 *  to the terrain that's actually rendered near sea level. */
const SHELL_MAX_HEIGHT_ABOVE_WATER = 3
/** Fraction of otherwise-eligible candidates kept — these are meant to be rare
 *  finds, not litter. */
const KEEP_CHANCE = 0.3

function hashChunk(cx: number, cz: number): number {
  let h = (cx * 668265263 + cz * 374761393) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Deterministic, worker-safe per-chunk item placement — mirrors
 * `chunkVegetation.ts` (pure data, instantiated into meshes on the main thread
 * by `chunkManager.ts`). Shells land in the coastal band (continentalness
 * between `oceanThreshold`/`coastThreshold` *and* close to `waterLevel` in
 * local height, where waves would actually wash them up); stones land on
 * strong mountain-ridge terrain. Finite — no respawn — the
 * caller filters out ids already recorded as collected.
 */
export function computeChunkItems(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
): ItemPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, waterLevel } = params
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, params.resolution)
  const random = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x17e51)

  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)

  const placements: ItemPlacement[] = []
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

    const continentalness = sample(tile.continentalness, wx, wz)
    const ridge = sample(tile.mountainRidge, wx, wz)

    let kind: ItemKind | null = null
    if (
      continentalness >= params.region.oceanThreshold &&
      continentalness <= params.region.coastThreshold &&
      h <= waterLevel + SHELL_MAX_HEIGHT_ABOVE_WATER
    ) {
      kind = 'shell'
    } else if (ridge >= MOUNTAIN_ITEM_MIN_RIDGE) {
      kind = 'stone'
    }
    if (!kind) continue
    if (random() > KEEP_CHANCE) continue

    placements.push({ id: `${coord.cx}:${coord.cz}:${i}`, x: wx, z: wz, kind })
  }

  return placements
}
