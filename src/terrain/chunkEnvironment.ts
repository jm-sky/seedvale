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

export type EnvironmentKind =
  | 'largeRock'
  | 'rockCluster'
  | 'fallenLog'
  | 'campfire'
  | 'monolith'
  | 'stoneCircle'
  | 'smallRuins'

export type EnvironmentPlacement = {
  x: number
  z: number
  kind: EnvironmentKind
  scale: number
  rotationY: number
  /** Meaning depends on `kind`: boulder irregularity 0..1 (`largeRock`/
   *  `rockCluster`), log length in world units (`fallenLog`), unused
   *  (`campfire`), height/count/damage variation 0..1 (`monolith`/
   *  `stoneCircle`/`smallRuins`) — see `createLargeRock`/`createRockCluster`/
   *  `createFallenLog`/`createMonolith`/`createStoneCircle`/`createSmallRuins`
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

/** Landmarks (plans/2026-08-09--049): much rarer than the decorations above —
 *  "częste" tier (monolith) roughly half as common as a campfire, "rzadkie"
 *  tier (stoneCircle/smallRuins) about half of that again. One roll per
 *  chunk per kind, each on its own seeded RNG stream — with these chances,
 *  a chunk rolling more than one landmark is negligible, so v1 doesn't need
 *  a shared "pick one landmark type" selector. */
const MONOLITH_CHANCE = 0.02
const STONE_CIRCLE_CHANCE = 0.008
const SMALL_RUINS_CHANCE = 0.008
/** Multi-point landmarks want sturdier, flatter footing than a single rock. */
const SLOPE_REJECT_LANDMARK = 0.6
/** Keep the whole landmark footprint inside its own chunk (simpler than
 *  cross-chunk ownership — see implementation notes' "Chunk boundaries"). */
const MONOLITH_MARGIN = 1.2
const STONE_CIRCLE_MARGIN = 4
const SMALL_RUINS_MARGIN = 2.5

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

  // --- Monolith: single standing stone, "częste" landmark tier ---
  const monolithRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 4) ^ 0x1d4b7)
  {
    const wx = coord.cx * chunkSize + (monolithRandom() * 2 - 1) * (half - MONOLITH_MARGIN)
    const wz = coord.cz * chunkSize + (monolithRandom() * 2 - 1) * (half - MONOLITH_MARGIN)
    const h = sample(tile.heights, wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slopeAt(wx, wz) <= SLOPE_REJECT_LANDMARK &&
      monolithRandom() <= MONOLITH_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'monolith',
        scale: 0.85 + monolithRandom() * 0.5,
        rotationY: monolithRandom() * Math.PI * 2,
        variant: monolithRandom(),
      })
    }
  }

  // --- Stone circle: small "rzadkie" landmark tier ---
  const stoneCircleRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 5) ^ 0x3ea92)
  {
    const wx = coord.cx * chunkSize + (stoneCircleRandom() * 2 - 1) * (half - STONE_CIRCLE_MARGIN)
    const wz = coord.cz * chunkSize + (stoneCircleRandom() * 2 - 1) * (half - STONE_CIRCLE_MARGIN)
    const h = sample(tile.heights, wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slopeAt(wx, wz) <= SLOPE_REJECT_LANDMARK &&
      stoneCircleRandom() <= STONE_CIRCLE_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'stoneCircle',
        scale: 0.9 + stoneCircleRandom() * 0.4,
        rotationY: stoneCircleRandom() * Math.PI * 2,
        variant: stoneCircleRandom(),
      })
    }
  }

  // --- Small ruins: low wall/foundation fragment, "rzadkie" landmark tier ---
  const ruinsRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 6) ^ 0x57c31)
  {
    const wx = coord.cx * chunkSize + (ruinsRandom() * 2 - 1) * (half - SMALL_RUINS_MARGIN)
    const wz = coord.cz * chunkSize + (ruinsRandom() * 2 - 1) * (half - SMALL_RUINS_MARGIN)
    const h = sample(tile.heights, wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slopeAt(wx, wz) <= SLOPE_REJECT_LANDMARK &&
      ruinsRandom() <= SMALL_RUINS_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'smallRuins',
        scale: 0.85 + ruinsRandom() * 0.4,
        rotationY: ruinsRandom() * Math.PI * 2,
        variant: ruinsRandom(),
      })
    }
  }

  return placements
}
