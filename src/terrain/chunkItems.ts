import type { ItemKind } from '../items/items'
import type { ChunkCoord } from './chunkGrid'
import type { VegetationPlacement } from './chunkVegetation'
import { createSeededRandom } from '../world/parseSeed'
import { PINE_SPECIES_INDICES } from '../world/treeLifecycle'
import { biomeWeightsAt } from './biomeRegions'
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

/** Second, independent candidate pool for branch/mushroom/flower/cone/herb — own
 *  RNG stream (different salt) and id prefix (`f<i>`) so it doesn't disturb
 *  the shell/stone placement above or collide with its ids in
 *  `collectedItemIds` (`chunkManager.ts`). */
const FLORA_CANDIDATES_PER_CHUNK = 6
/** Radius (world units) within which a `tree` vegetation placement in the
 *  same chunk counts as "nearby" for branch/cone preference. Same-chunk only
 *  — same approximation `chunkVegetation.ts`/this module already make for
 *  every other terrain feature (no cross-chunk lookups). */
const FLORA_TREE_PROXIMITY = 7
/** Scales the summed kind-weights into an overall spawn chance — keeps flora
 *  a scattered find, not a carpet, even where every weight is high. */
const FLORA_KEEP_SCALE = 0.5

function nearTree(vegetation: readonly VegetationPlacement[], x: number, z: number): boolean {
  for (const v of vegetation) {
    if (v.kind === 'tree' && Math.hypot(v.x - x, v.z - z) <= FLORA_TREE_PROXIMITY) return true
  }
  return false
}

/** Small mushroom-weight bonus near a pine (plan 140) — reuses the same
 *  chunk-local `vegetation` array `nearTree` already checks, no extra pass. */
function nearPine(vegetation: readonly VegetationPlacement[], x: number, z: number): boolean {
  for (const v of vegetation) {
    if (
      v.kind === 'tree' &&
      PINE_SPECIES_INDICES.includes(v.speciesIndex) &&
      Math.hypot(v.x - x, v.z - z) <= FLORA_TREE_PROXIMITY
    ) {
      return true
    }
  }
  return false
}

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
 * strong mountain-ridge terrain; branch/mushroom/flower/cone/herb land per
 * `biomeWeightsAt`/tree-proximity preference (see `FLORA_*` constants above).
 * Finite — no respawn — the caller filters out ids already recorded as
 * collected. `vegetation` is this chunk's own `computeChunkVegetation` result
 * (worker.ts computes it first), used only for the flora tree-proximity check.
 */
export function computeChunkItems(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  vegetation: readonly VegetationPlacement[],
): ItemPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, waterLevel, heightScale, region } = params
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

  const floraRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz) ^ 0x5b2e1)
  for (let i = 0; i < FLORA_CANDIDATES_PER_CHUNK; i++) {
    const localX = (floraRandom() * 2 - 1) * half
    const localZ = (floraRandom() * 2 - 1) * half
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
    const treeClose = nearTree(vegetation, wx, wz)
    const pineClose = nearPine(vegetation, wx, wz)

    // Preference weights, not hard gates — a flower can still turn up on a
    // rocky slope, just rarely; a mushroom is common in a swamp/forest, rare
    // on open dry ground. A nearby pine adds a small extra bonus on top.
    const mushroomWeight =
      (biome.swamp * 0.7 + biome.forest * 0.35 + moistureRegion * 0.15) *
      (treeClose ? 1.3 : 0.8) *
      (pineClose ? 1.15 : 1)
    const flowerWeight = (1 - biome.desert) * (1 - biome.swamp) * (1 - ridge) * (altitude < 0.45 ? 1 : 0.3)
    const branchWeight = treeClose ? 0.9 : biome.forest * 0.25
    const coneWeight = treeClose ? biome.forest * 0.85 : 0
    // Herb (plan 153) — forest-floor medicinal plant, deliberately scarcer
    // than mushroom (half its weight) so it stays a "found" healing source
    // rather than a reliable food-equivalent supply.
    const herbWeight = (biome.forest * 0.4 + biome.swamp * 0.2) * (treeClose ? 1.1 : 0.7)

    const total = mushroomWeight + flowerWeight + branchWeight + coneWeight + herbWeight
    if (total <= 0) continue
    if (floraRandom() > Math.min(1, total) * FLORA_KEEP_SCALE) continue

    const roll = floraRandom() * total
    let kind: ItemKind
    if (roll < mushroomWeight) kind = 'mushroom'
    else if (roll < mushroomWeight + flowerWeight) kind = 'flower'
    else if (roll < mushroomWeight + flowerWeight + branchWeight) kind = 'branch'
    else if (roll < mushroomWeight + flowerWeight + branchWeight + coneWeight) kind = 'cone'
    else kind = 'herb'

    placements.push({ id: `${coord.cx}:${coord.cz}:f${i}`, x: wx, z: wz, kind })
  }

  return placements
}
