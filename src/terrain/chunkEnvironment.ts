import type { ChunkCoord } from './chunkGrid'
import type { VegetationPlacement } from './chunkVegetation'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt } from './biomeRegions'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  sampleApronGrid,
} from './chunkHeightmap'

export type EnvironmentKind = 'largeRock' | 'rockCluster' | 'fallenLog' | 'campfire'

export type EnvironmentPlacement = {
  x: number
  z: number
  kind: EnvironmentKind
  scale: number
  rotationY: number
  /** Meaning depends on `kind`: boulder irregularity 0..1 (`largeRock`/
   *  `rockCluster`), log length in world units (`fallenLog`), unused
   *  (`campfire`) — see `createLargeRock`/`createRockCluster`/`createFallenLog`
   *  in `settlement/props.ts`. */
  variant: number
}

const ROCK_CANDIDATES_PER_CHUNK = 4
const LOG_CANDIDATES_PER_CHUNK = 3
const CAMPFIRE_CANDIDATES_PER_CHUNK = 1
const SLOPE_SAMPLE_STEP = 1.5
/** Rocks tolerate rougher ground than vegetation/logs — outcrops are often on
 *  a slope, that's the point. */
const SLOPE_REJECT_ROCK = 1.4
/** Logs/campfires want relatively flat ground, same threshold as
 *  `chunkVegetation.ts`'s `SLOPE_REJECT`. */
const SLOPE_REJECT_FLAT = 0.9
const TREE_PROXIMITY_RADIUS = 6
/** Rare, deliberate "someone was here" points, not litter. */
const CAMPFIRE_CHANCE = 0.035
/** Reject candidates sitting on a road/path corridor. */
const ROAD_TINT_REJECT = 0.15

function hashChunk(cx: number, cz: number, salt: number): number {
  let h = (cx * 668265263 + cz * 374761393 + salt * 2654435761) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

function nearTree(vegetation: readonly VegetationPlacement[], x: number, z: number, radius: number): boolean {
  for (const v of vegetation) {
    if (v.kind === 'tree' && Math.hypot(v.x - x, v.z - z) <= radius) return true
  }
  return false
}

/**
 * Deterministic, worker-safe per-chunk decorative object placement — pure
 * data only, instantiated into procedural (no-GLB) meshes on the main thread
 * by `chunkManager.ts`. Mirrors `chunkVegetation.ts`/`chunkItems.ts`'s shape:
 * own seeded RNG per object family (rocks/logs/campfires), preferences bias
 * frequency rather than hard-gating placement. `vegetation` is this chunk's
 * own `computeChunkVegetation` result, used only for the fallen-log/rock
 * tree-proximity nudge. Purely decorative — none of these are `Interactable`.
 */
export function computeChunkEnvironment(
  coord: ChunkCoord,
  tile: ChunkTileData,
  params: ChunkTileParams,
  vegetation: readonly VegetationPlacement[],
): EnvironmentPlacement[] {
  if (params.isHomeChunk) return []

  const { chunkSize, waterLevel, heightScale, region } = params
  const o = apronOriginWorld(coord.cx, coord.cz, chunkSize, params.resolution)
  const sample = (grid: Float32Array, x: number, z: number) =>
    sampleApronGrid(grid, o.apronRes, o.x, o.z, o.step, x, z)
  const half = chunkSize / 2
  const placements: EnvironmentPlacement[] = []

  const slopeAt = (wx: number, wz: number): number => {
    const d = SLOPE_SAMPLE_STEP
    return (
      (Math.abs(sample(tile.heights, wx + d, wz) - sample(tile.heights, wx - d, wz)) +
        Math.abs(sample(tile.heights, wx, wz + d) - sample(tile.heights, wx, wz - d))) /
      (2 * d)
    )
  }

  // --- Rocks: large boulders + small clusters ---
  const rockRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 1) ^ 0x2f6a1)
  for (let i = 0; i < ROCK_CANDIDATES_PER_CHUNK; i++) {
    const wx = coord.cx * chunkSize + (rockRandom() * 2 - 1) * half
    const wz = coord.cz * chunkSize + (rockRandom() * 2 - 1) * half
    const h = sample(tile.heights, wx, wz)
    if (h <= waterLevel + 0.3) continue
    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path/clearing

    if (slopeAt(wx, wz) > SLOPE_REJECT_ROCK) continue

    const ridge = sample(tile.mountainRidge, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const coastal =
      continentalness >= region.oceanThreshold - 0.03 && continentalness <= region.coastThreshold + 0.05
    // Frequency ramps with ridge strength/coastal proximity; the floor keeps
    // a rare plains outcrop possible instead of a hard mountains-only gate.
    const chance = 0.08 + ridge * 0.55 + (coastal ? 0.2 : 0)
    if (rockRandom() > chance) continue

    const isLarge = rockRandom() < 0.35 + ridge * 0.3
    placements.push({
      x: wx,
      z: wz,
      kind: isLarge ? 'largeRock' : 'rockCluster',
      scale: isLarge ? 0.9 + rockRandom() * 1.3 : 0.5 + rockRandom() * 0.6,
      rotationY: rockRandom() * Math.PI * 2,
      variant: rockRandom(),
    })
  }

  // --- Fallen logs: forest terrain, ideally near trees ---
  const logRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 2) ^ 0x4c17)
  for (let i = 0; i < LOG_CANDIDATES_PER_CHUNK; i++) {
    const wx = coord.cx * chunkSize + (logRandom() * 2 - 1) * half
    const wz = coord.cz * chunkSize + (logRandom() * 2 - 1) * half
    const h = sample(tile.heights, wx, wz)
    if (h <= waterLevel + 0.4) continue
    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue // road/path/clearing
    if (slopeAt(wx, wz) > SLOPE_REJECT_FLAT) continue

    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const treeClose = nearTree(vegetation, wx, wz, TREE_PROXIMITY_RADIUS)
    const chance = biome.forest * (treeClose ? 0.5 : 0.12)
    if (logRandom() > chance) continue

    placements.push({
      x: wx,
      z: wz,
      kind: 'fallenLog',
      scale: 0.8 + logRandom() * 0.5,
      rotationY: logRandom() * Math.PI * 2,
      variant: 1.6 + logRandom() * 1.8, // log length, world units
    })
  }

  // --- Old campfires: rare, deliberate "someone was here" points ---
  const fireRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 3) ^ 0x9b31)
  for (let i = 0; i < CAMPFIRE_CANDIDATES_PER_CHUNK; i++) {
    const wx = coord.cx * chunkSize + (fireRandom() * 2 - 1) * half
    const wz = coord.cz * chunkSize + (fireRandom() * 2 - 1) * half
    const h = sample(tile.heights, wx, wz)
    if (h <= waterLevel + 0.4) continue
    if (slopeAt(wx, wz) > SLOPE_REJECT_FLAT) continue
    if (sample(tile.roadTint, wx, wz) > ROAD_TINT_REJECT) continue
    if (fireRandom() > CAMPFIRE_CHANCE) continue

    placements.push({
      x: wx,
      z: wz,
      kind: 'campfire',
      scale: 0.85 + fireRandom() * 0.3,
      rotationY: fireRandom() * Math.PI * 2,
      variant: 0,
    })
  }

  return placements
}
