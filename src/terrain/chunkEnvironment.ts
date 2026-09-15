import type { ChunkCoord } from './chunkGrid'
import type { VegetationPlacement } from './chunkVegetation'
import { distanceToSegment } from '../math/segment'
import { cemeteryGraveLayout, type CemeterySize } from '../settlement/props'
import { siteChunkContainsPoint } from '../world/locations/darkForestTreasureSite'
import { getActiveDarkForestTreasureSite } from '../world/locations/darkForestTreasureSiteRuntime'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt, forestDensityAt } from './biomeRegions'
import { resolveCemeteriesForChunk } from './cemeteryPlacement'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  type RoadCorridorSegment,
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
  | 'ruins'
  | 'cemetery'
  | 'boat'
  | 'shipwreck'
  | 'tower'
  | 'oldTree'
  | 'wagon'

export type EnvironmentPlacement = {
  x: number
  z: number
  kind: EnvironmentKind
  scale: number
  rotationY: number
  /** Meaning depends on `kind`: boulder irregularity 0..1 (`largeRock`/
   *  `rockCluster`), log length in world units (`fallenLog`), unused
   *  (`campfire`), height/count/damage variation 0..1 (`monolith`/
   *  `stoneCircle`/`smallRuins`/`cemetery`/`boat`/`shipwreck`/`tower`/
   *  `oldTree`/`wagon`) — see factories in `settlement/props.ts`. */
  variant: number
  /** Stable identity for proper landmark kinds (`monolith`/`stoneCircle`/
   *  `smallRuins`/`ruins`/`cemetery`/`boat`/`shipwreck`/`tower`/`oldTree`/
   *  `wagon`) — purely derived from `(seed, chunk, kind, ordinal)`, so it
   *  regenerates identically on every chunk reload without needing save-game
   *  persistence (plan 110; extended world-terrain-027). Absent for the
   *  purely decorative kinds (rock/log/campfire). See `deriveLandmarkId`. */
  id?: string
  /** Cemetery layout size (plan 173) — SM/MD/LG differ in footprint, grave
   *  count, spacing and aisle layout (`createCemetery` in
   *  `settlement/decorProps.ts`), not just a scale multiplier. Present only
   *  for `kind === 'cemetery'`. */
  cemeterySize?: CemeterySize
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
/** Rare coastal / road / natural landmarks (plan world-terrain-027). Own RNG
 *  streams appended after existing landmark salts so prior rolls stay stable. */
const WAGON_CHANCE = 0.04
const BOAT_CHANCE = 0.014
const TOWER_CHANCE = 0.006
const OLD_TREE_CHANCE = 0.005
const SHIPWRECK_CHANCE = 0.003
/** Multi-point landmarks want sturdier, flatter footing than a single rock. */
const SLOPE_REJECT_LANDMARK = 0.6
/** Keep the whole landmark footprint inside its own chunk (simpler than
 *  cross-chunk ownership — see implementation notes' "Chunk boundaries"). */
const MONOLITH_MARGIN = 1.2
const STONE_CIRCLE_MARGIN = 4
const SMALL_RUINS_MARGIN = 2.5
const WAGON_MARGIN = 2.5
const BOAT_MARGIN = 2.5
const TOWER_MARGIN = 4
const OLD_TREE_MARGIN = 5
const SHIPWRECK_MARGIN = 6
/** Shoreline band above water for boats (same idea as shell placement). */
const BOAT_MAX_HEIGHT_ABOVE_WATER = 2.5
const BOAT_MIN_HEIGHT_ABOVE_WATER = -0.15
/** Shipwreck may sit slightly lower / partially in shallow water. */
const SHIPWRECK_MAX_HEIGHT_ABOVE_WATER = 2.2
const SHIPWRECK_MIN_HEIGHT_ABOVE_WATER = -0.8
/** Lateral offset past a road corridor edge before a wagon is accepted. */
const WAGON_SHOULDER_MIN = 1.2
const WAGON_SHOULDER_MAX = 4.5
/** Circular footprint checks against roads / slope samples. */
const TOWER_FOOTPRINT_RADIUS = 3.2
const SHIPWRECK_FOOTPRINT_RADIUS = 5.5
const OLD_TREE_FOOTPRINT_RADIUS = 2.8
/** Vegetation trees cleared around an accepted old-tree landmark. */
export const OLD_TREE_CLEARANCE_RADIUS = 8
/** Weighted roll for cemetery size (plan 173) — most cemeteries stay small;
 *  LG is a deliberately rarer, bigger village-fringe landmark. */
const CEMETERY_SIZE_WEIGHTS: readonly [CemeterySize, number][] = [
  ['SM', 0.5],
  ['MD', 0.35],
  ['LG', 0.15],
]
/** Cemetery sits on the village smoothing-disk fringe, past house clearings. */
export const CEMETERY_INNER_FRAC = 0.55
export const CEMETERY_OUTER_FRAC = 1.05
export const CEMETERY_CLEARING_PAD = 2
export const LANDMARK_BIAS_MIN = 0.2
export const LANDMARK_BIAS_MAX = 2

export type LandmarkBiasKind = 'monolith' | 'stoneCircle' | 'smallRuins'

/** `EnvironmentKind`s that carry a stable `EnvironmentPlacement.id`
 *  (plan 110) — the only ones a landmark quest can target (plan 132;
 *  extended world-terrain-027). */
export type LandmarkKind =
  | 'monolith'
  | 'stoneCircle'
  | 'smallRuins'
  | 'ruins'
  | 'cemetery'
  | 'boat'
  | 'shipwreck'
  | 'tower'
  | 'oldTree'
  | 'wagon'

/** Display label for interaction prompts/dialogue speaker names (plan 132) —
 *  same role as `ANIMAL_LABELS`/`SPAWNER_LABELS` for their own domains. */
export const LANDMARK_LABELS: Record<LandmarkKind, string> = {
  monolith: 'Monolit',
  stoneCircle: 'Krąg kamieni',
  smallRuins: 'Ruiny',
  ruins: 'Ruiny',
  cemetery: 'Cmentarz',
  boat: 'Łódź',
  shipwreck: 'Wrak',
  tower: 'Wieża',
  oldTree: 'Stare drzewo',
  wagon: 'Porzucony wóz',
}

export type LandmarkBiasInput = {
  mountainRidge: number
  altitude01: number
  slope: number
  desert: number
  swamp: number
  forest: number
}

export type VillageDisk = {
  x: number
  z: number
  radius: number
}

function clampBias(n: number): number {
  return Math.min(LANDMARK_BIAS_MAX, Math.max(LANDMARK_BIAS_MIN, n))
}

/** Soft multiplier on landmark base chance. Unsuitable terrain still places,
 *  just less often — never a hard gate. */
export function landmarkChanceBias(kind: LandmarkBiasKind, s: LandmarkBiasInput): number {
  switch (kind) {
    case 'monolith':
      return clampBias(
        0.45 + s.mountainRidge * 1.1 + Math.min(1, Math.max(0, s.altitude01)) * 0.7 - s.swamp * 0.5,
      )
    case 'smallRuins': {
      const midAlt = 1 - Math.abs((s.altitude01 - 0.22) / 0.35)
      return clampBias(
        0.35 +
          s.forest * 0.9 +
          Math.max(0, midAlt) * 0.4 -
          s.mountainRidge * 0.85 -
          s.desert * 0.7 -
          s.swamp * 0.7,
      )
    }
    case 'stoneCircle': {
      const hill = Math.min(1, Math.max(0, s.altitude01) * 1.4)
      const flatHill = s.mountainRidge * (1 - Math.min(1, s.slope / SLOPE_REJECT_LANDMARK))
      return clampBias(0.4 + hill * 0.8 + flatHill * 0.6 - s.desert * 0.6 - s.swamp * 0.7)
    }
  }
}

/** True when `(x,z)` is on a village smoothing-disk fringe and outside
 *  plaza/house/garden clearings. No regional disks → never. */
export function cemeteryFitsVillageFringe(
  x: number,
  z: number,
  regional: readonly VillageDisk[],
  clearings: readonly VillageDisk[],
): boolean {
  if (regional.length === 0) return false
  let nearest: VillageDisk | null = null
  let nearestDist = Infinity
  for (const disk of regional) {
    const d = Math.hypot(x - disk.x, z - disk.z)
    if (d < nearestDist) {
      nearestDist = d
      nearest = disk
    }
  }
  if (!nearest) return false
  const inner = nearest.radius * CEMETERY_INNER_FRAC
  const outer = nearest.radius * CEMETERY_OUTER_FRAC
  if (nearestDist < inner || nearestDist > outer) return false
  for (const clearing of clearings) {
    if (Math.hypot(x - clearing.x, z - clearing.z) <= clearing.radius + CEMETERY_CLEARING_PAD) {
      return false
    }
  }
  return true
}

/** Upper bound on a grave's own offset from `cemeteryGraveLayout`'s spot
 *  (plan world-terrain-006): `createCemetery`'s deterministic jitter
 *  (`jitterX`/`jitterZ`, up to ~0.125/0.1 × `scale`) plus the grave stone's
 *  own half-footprint (`createGraveStone`'s base box, ~0.25 × `scale`),
 *  rounded up to a round, safely conservative constant. */
const CEMETERY_GRAVE_CLEARANCE = 0.6
/** Extra clearance beyond a road/path corridor's own half-width before a
 *  cemetery footprint is accepted — a visible buffer, not just "doesn't
 *  overlap" (plan world-terrain-006). */
const CEMETERY_ROAD_SAFETY_MARGIN = 2

/** Farthest any grave (including its own jitter/footprint) can sit from the
 *  cemetery's placement point, for a given `size`/`scale` — a rotation-
 *  invariant (circular) upper bound on the real grave-grid footprint. Cheap
 *  to check against road segments without needing the landmark's rotation,
 *  which (unlike position/size/scale) is only rolled once a cemetery is
 *  already accepted. */
function cemeteryFootprintRadius(size: CemeterySize, scale: number): number {
  const layout = cemeteryGraveLayout(size, scale)
  let maxDist = 0
  for (const p of layout) {
    const d = Math.hypot(p.x, p.z)
    if (d > maxDist) maxDist = d
  }
  return maxDist + CEMETERY_GRAVE_CLEARANCE * scale
}

/** True when a cemetery's whole grave-grid footprint — not just its center
 *  point — clears every nearby road/path corridor by
 *  `CEMETERY_ROAD_SAFETY_MARGIN` (plan world-terrain-006). The plain
 *  `roadTint` sample `computeChunkEnvironment` already rejects on only tests
 *  the placement point; a wider MD/LG cemetery's grave grid can still extend
 *  across a road that misses that single point. */
export function cemeteryFootprintClearsRoads(
  x: number,
  z: number,
  size: CemeterySize,
  scale: number,
  roadSegments: readonly RoadCorridorSegment[],
): boolean {
  const radius = cemeteryFootprintRadius(size, scale)
  for (const seg of roadSegments) {
    const dist = distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz)
    if (dist < radius + seg.halfWidth + CEMETERY_ROAD_SAFETY_MARGIN) return false
  }
  return true
}

/** Deterministic weighted cemetery-size roll (plan 173) — consumes one call
 *  from the caller's seeded RNG stream, same "no `Math.random()`" contract
 *  as every other roll in this file. */
export function rollCemeterySize(random: () => number): CemeterySize {
  const r = random()
  let acc = 0
  for (const [size, weight] of CEMETERY_SIZE_WEIGHTS) {
    acc += weight
    if (r <= acc) return size
  }
  return 'LG'
}

function hashChunk(cx: number, cz: number, salt: number): number {
  let h = (cx * 668265263 + cz * 374761393 + salt * 2654435761) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return (h ^ (h >>> 16)) >>> 0
}

/** Stable id for a proper landmark kind — pure function of
 *  `(seed, chunk, kind, ordinal)`, so identical world seed + chunk coords
 *  regenerate the exact same id (plan 110). `ordinal` distinguishes multiple
 *  rolls of the same `kind` in one chunk; today each kind rolls at most once
 *  per chunk (see the single-roll blocks below), so callers always pass `0` —
 *  kept as a parameter so a future multi-roll change doesn't silently
 *  collide ids. */
export function deriveLandmarkId(seed: number, cx: number, cz: number, kind: EnvironmentKind, ordinal: number): string {
  return `${kind}:${cx}:${cz}:${ordinal}:${(seed >>> 0).toString(36)}`
}

function nearTree(vegetation: readonly VegetationPlacement[], x: number, z: number, radius: number): boolean {
  for (const v of vegetation) {
    if (v.kind === 'tree' && Math.hypot(v.x - x, v.z - z) <= radius) return true
  }
  return false
}

/** Drop ordinary vegetation trees inside an old-tree landmark's clearance
 *  radius so the landmark sits in a real clearing (plan world-terrain-027).
 *  Pure / worker-safe — does not mutate `vegetation` or `environment`. */
export function clearVegetationAroundOldTrees(
  vegetation: readonly VegetationPlacement[],
  environment: readonly EnvironmentPlacement[],
  clearanceRadius = OLD_TREE_CLEARANCE_RADIUS,
): VegetationPlacement[] {
  const oldTrees = environment.filter((p) => p.kind === 'oldTree')
  if (oldTrees.length === 0) return vegetation as VegetationPlacement[]
  return vegetation.filter((v) => {
    if (v.kind !== 'tree') return true
    for (const tree of oldTrees) {
      if (Math.hypot(v.x - tree.x, v.z - tree.z) <= clearanceRadius) return false
    }
    return true
  })
}

/** Minimal terrain view `resolveCemeteryPlacement` needs — cemetery
 *  acceptance never reads vegetation/biome/moisture/continentalness, only
 *  local height and road tint (see the function's own doc comment). Backed
 *  by `computeChunkEnvironment`'s own apron-grid `sample()` for a loaded/
 *  full-generation tile, or by `chunkHeightmap.ts`'s
 *  `createLocalTerrainSampler` for an unloaded-chunk lookup — both resolve
 *  through the same underlying per-texel math, which is what keeps the two
 *  callers in parity. */
export type CemeteryTerrainSampler = {
  heightAt: (wx: number, wz: number) => number
  roadTintAt: (wx: number, wz: number) => number
}

/** Terrain view classic landmark placement actually reads (`monolith` /
 *  `stoneCircle` / `smallRuins`). Cemetery's two accessors plus ridge and
 *  moisture at the candidate point for `landmarkChanceBias`. No vegetation,
 *  continentalness, or earlier environment placements.
 * @domain world-terrain
 */
export type LandmarkTerrainSampler = CemeteryTerrainSampler & {
  mountainRidgeAt: (wx: number, wz: number) => number
  moistureRegionAt: (wx: number, wz: number) => number
}

export { resolveCemeteriesForChunk, resolveCemeteryPlacement } from './cemeteryPlacement'

type ClassicLandmarkSpec = {
  chunkSalt: number
  xorSalt: number
  chance: number
  margin: number
  scaleMin: number
  scaleRange: number
}

const CLASSIC_LANDMARK_SPECS: Record<LandmarkBiasKind, ClassicLandmarkSpec> = {
  monolith: {
    chunkSalt: 4,
    xorSalt: 0x1d4b7,
    chance: MONOLITH_CHANCE,
    margin: MONOLITH_MARGIN,
    scaleMin: 0.85,
    scaleRange: 0.5,
  },
  stoneCircle: {
    chunkSalt: 5,
    xorSalt: 0x3ea92,
    chance: STONE_CIRCLE_CHANCE,
    margin: STONE_CIRCLE_MARGIN,
    scaleMin: 0.9,
    scaleRange: 0.4,
  },
  smallRuins: {
    chunkSalt: 6,
    xorSalt: 0x57c31,
    chance: SMALL_RUINS_CHANCE,
    margin: SMALL_RUINS_MARGIN,
    scaleMin: 0.85,
    scaleRange: 0.4,
  },
}

function landmarkSlopeAt(terrain: CemeteryTerrainSampler, wx: number, wz: number): number {
  const d = SLOPE_SAMPLE_STEP
  return (
    (Math.abs(terrain.heightAt(wx + d, wz) - terrain.heightAt(wx - d, wz)) +
      Math.abs(terrain.heightAt(wx, wz + d) - terrain.heightAt(wx, wz - d))) /
    (2 * d)
  )
}

/**
 * Shared classic-landmark resolver used by both streamed
 * `computeChunkEnvironment()` and unloaded `findLandmarkNear()`. Owns
 * candidate RNG, acceptance RNG, coordinates, terrain gates, chance bias,
 * stable id, scale, rotation and variant for `monolith` / `stoneCircle` /
 * `smallRuins`.
 *
 * Unloaded lookup and normal streamed generation consume these same rules
 * and the same apron-texel terrain semantics without materializing a full
 * chunk tile on the main thread (plan world-028). Salts, chances, margins
 * and RNG call order are the original `computeChunkEnvironment` contract —
 * do not change them as a performance lever.
 *
 * River input follows the caller. Unloaded lookup still passes
 * `paramsFor(coord, [])` (no river carving), the pre-existing discrepancy
 * versus a later streamed tile; this resolver does not hide or widen it.
 * @domain world-terrain
 */
export function resolveClassicLandmarkPlacement(
  kind: LandmarkBiasKind,
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: LandmarkTerrainSampler,
): EnvironmentPlacement | null {
  const spec = CLASSIC_LANDMARK_SPECS[kind]
  const { chunkSize, waterLevel, heightScale, region } = params
  const half = chunkSize / 2
  const random = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, spec.chunkSalt) ^ spec.xorSalt)
  const wx = coord.cx * chunkSize + (random() * 2 - 1) * (half - spec.margin)
  const wz = coord.cz * chunkSize + (random() * 2 - 1) * (half - spec.margin)
  const h = terrain.heightAt(wx, wz)
  const slope = landmarkSlopeAt(terrain, wx, wz)
  if (
    !(
      h > waterLevel + 0.3 &&
      terrain.roadTintAt(wx, wz) <= ROAD_TINT_REJECT &&
      slope <= SLOPE_REJECT_LANDMARK
    )
  ) {
    return null
  }
  const altitude01 = (h - waterLevel) / Math.max(heightScale, 0.001)
  const biome = biomeWeightsAt(terrain.moistureRegionAt(wx, wz), altitude01, region)
  const bias = landmarkChanceBias(kind, {
    mountainRidge: terrain.mountainRidgeAt(wx, wz),
    altitude01,
    slope,
    desert: biome.desert,
    swamp: biome.swamp,
    forest: biome.forest,
  })
  if (random() > spec.chance * bias) return null
  return {
    x: wx,
    z: wz,
    kind,
    scale: spec.scaleMin + random() * spec.scaleRange,
    rotationY: random() * Math.PI * 2,
    variant: random(),
    id: deriveLandmarkId(params.seed, coord.cx, coord.cz, kind, 0),
  }
}

export function isClassicLandmarkKind(kind: LandmarkKind): kind is LandmarkBiasKind {
  return kind === 'monolith' || kind === 'stoneCircle' || kind === 'smallRuins'
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

  // Home chunks skip rocks/logs/campfires (settlement plants its own forest)
  // but still roll landmarks so the spawn village can get a cemetery.
  if (!params.isHomeChunk) {
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
    const continentalness = sample(tile.continentalness, wx, wz)
    const ridge = sample(tile.mountainRidge, wx, wz)
    // Continuous forest density (same signal `chunkVegetation.ts` densifies
    // trees with, plan 182 §8) rather than the coarse desert/swamp-remainder
    // `biome.forest` — deadwood frequency now actually tracks how deep the
    // surrounding forest reads (open ≈ rare, deep forest ≈ clearly present),
    // not "any non-desert/swamp land".
    const forestDensity = forestDensityAt(moistureRegion, altitude, continentalness, ridge, region)
    const treeClose = nearTree(vegetation, wx, wz, TREE_PROXIMITY_RADIUS)
    const chance = forestDensity * (treeClose ? 0.6 : 0.16)
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
  }

  // --- Classic landmarks: shared resolver (plan world-028) ---
  const landmarkTerrain: LandmarkTerrainSampler = {
    heightAt: (wx, wz) => sample(tile.heights, wx, wz),
    roadTintAt: (wx, wz) => sample(tile.roadTint, wx, wz),
    mountainRidgeAt: (wx, wz) => sample(tile.mountainRidge, wx, wz),
    moistureRegionAt: (wx, wz) => sample(tile.moistureRegion, wx, wz),
  }
  {
    const monolith = resolveClassicLandmarkPlacement('monolith', coord, params, landmarkTerrain)
    if (monolith) placements.push(monolith)
    const stoneCircle = resolveClassicLandmarkPlacement('stoneCircle', coord, params, landmarkTerrain)
    if (stoneCircle) placements.push(stoneCircle)
    const smallRuins = resolveClassicLandmarkPlacement('smallRuins', coord, params, landmarkTerrain)
    if (smallRuins) placements.push(smallRuins)
  }

  // --- Cemetery: assignment-driven active cemeteries + rare abandoned (plan world-terrain-016) ---
  const cemeteryTerrain = {
    heightAt: (wx: number, wz: number) => sample(tile.heights, wx, wz),
    roadTintAt: (wx: number, wz: number) => sample(tile.roadTint, wx, wz),
  }
  placements.push(...resolveCemeteriesForChunk(coord, params, cemeteryTerrain))

  const authored = params.authoredExpeditionRuins ?? (() => {
    const site = getActiveDarkForestTreasureSite()
    if (!site) return null
    return {
      id: site.landmarkId,
      x: site.x,
      z: site.z,
      rotationY: site.rotationY,
      variant: site.variant,
      scale: site.scale,
    }
  })()
  if (
    authored
    && siteChunkContainsPoint(coord, chunkSize, authored.x, authored.z)
    && !placements.some((p) => p.id === authored.id)
  ) {
    placements.push({
      x: authored.x,
      z: authored.z,
      kind: 'ruins',
      scale: authored.scale,
      rotationY: authored.rotationY,
      variant: authored.variant,
      id: authored.id,
    })
  }

  const footprintClearsRoads = (wx: number, wz: number, radius: number): boolean => {
    for (const seg of params.roadSegments) {
      if (distanceToSegment(wx, wz, seg.ax, seg.az, seg.bx, seg.bz) < radius + seg.halfWidth + 1.5) {
        return false
      }
    }
    return true
  }

  const footprintSlopeOk = (wx: number, wz: number, radius: number, maxSlope: number): boolean => {
    if (slopeAt(wx, wz) > maxSlope) return false
    const samples = [
      [radius * 0.7, 0],
      [-radius * 0.7, 0],
      [0, radius * 0.7],
      [0, -radius * 0.7],
    ] as const
    for (const [dx, dz] of samples) {
      if (slopeAt(wx + dx, wz + dz) > maxSlope) return false
    }
    return true
  }

  const inVillageClearing = (wx: number, wz: number, pad: number): boolean => {
    for (const clearing of params.clearings) {
      if (Math.hypot(wx - clearing.x, wz - clearing.z) <= clearing.radius + pad) return true
    }
    for (const disk of params.regional) {
      if (Math.hypot(wx - disk.x, wz - disk.z) <= disk.radius * 0.55) return true
    }
    return false
  }

  const shoreYawAt = (wx: number, wz: number): number => {
    const d = 2.5
    const cXP = sample(tile.continentalness, wx + d, wz)
    const cXM = sample(tile.continentalness, wx - d, wz)
    const cZP = sample(tile.continentalness, wx, wz + d)
    const cZM = sample(tile.continentalness, wx, wz - d)
    // Gradient of continentalness points inland; boat/ship long axis faces shore.
    return Math.atan2(-(cXP - cXM), -(cZP - cZM))
  }

  const isCoastalBand = (continentalness: number): boolean =>
    continentalness >= region.oceanThreshold - 0.02 && continentalness <= region.coastThreshold + 0.04

  // --- Abandoned wagon: beside a road corridor, not on it (world-terrain-027) ---
  const wagonRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 7) ^ 0x6a18d)
  {
    const segments = params.roadSegments
    if (segments.length > 0) {
      const seg = segments[Math.floor(wagonRandom() * segments.length)]!
      const t = wagonRandom()
      const alongX = seg.ax + (seg.bx - seg.ax) * t
      const alongZ = seg.az + (seg.bz - seg.az) * t
      const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az) || 1
      const nx = -(seg.bz - seg.az) / len
      const nz = (seg.bx - seg.ax) / len
      const side = wagonRandom() < 0.5 ? -1 : 1
      const shoulder = seg.halfWidth + WAGON_SHOULDER_MIN + wagonRandom() * (WAGON_SHOULDER_MAX - WAGON_SHOULDER_MIN)
      const wx = alongX + nx * side * shoulder
      const wz = alongZ + nz * side * shoulder
      const halfMargin = half - WAGON_MARGIN
      const inChunk =
        Math.abs(wx - coord.cx * chunkSize) <= halfMargin && Math.abs(wz - coord.cz * chunkSize) <= halfMargin
      const h = sample(tile.heights, wx, wz)
      if (
        inChunk
        && h > waterLevel + 0.35
        && slopeAt(wx, wz) <= SLOPE_REJECT_LANDMARK
        && !inVillageClearing(wx, wz, 2)
        && wagonRandom() <= WAGON_CHANCE
      ) {
        const yaw = Math.atan2(seg.bx - seg.ax, seg.bz - seg.az) + (wagonRandom() - 0.5) * 0.35
        placements.push({
          x: wx,
          z: wz,
          kind: 'wagon',
          scale: 0.95 + wagonRandom() * 0.15,
          rotationY: yaw,
          variant: wagonRandom(),
          id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'wagon', 0),
        })
      }
    }
  }

  // --- Shore boat: coastal band near waterline ---
  const boatRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 8) ^ 0x71c4e)
  {
    const wx = coord.cx * chunkSize + (boatRandom() * 2 - 1) * (half - BOAT_MARGIN)
    const wz = coord.cz * chunkSize + (boatRandom() * 2 - 1) * (half - BOAT_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const heightAbove = h - waterLevel
    if (
      isCoastalBand(continentalness)
      && heightAbove >= BOAT_MIN_HEIGHT_ABOVE_WATER
      && heightAbove <= BOAT_MAX_HEIGHT_ABOVE_WATER
      && sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT
      && slopeAt(wx, wz) <= SLOPE_REJECT_FLAT
      && footprintClearsRoads(wx, wz, 2)
      && !inVillageClearing(wx, wz, 3)
      && boatRandom() <= BOAT_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'boat',
        scale: 0.9 + boatRandom() * 0.25,
        rotationY: shoreYawAt(wx, wz) + (boatRandom() - 0.5) * 0.4,
        variant: boatRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'boat', 0),
      })
    }
  }

  // --- Stone tower: coastal overlook or mountain ridge ---
  const towerRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 9) ^ 0x82b59)
  {
    const wx = coord.cx * chunkSize + (towerRandom() * 2 - 1) * (half - TOWER_MARGIN)
    const wz = coord.cz * chunkSize + (towerRandom() * 2 - 1) * (half - TOWER_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const ridge = sample(tile.mountainRidge, wx, wz)
    const altitude01 = (h - waterLevel) / Math.max(heightScale, 0.001)
    const coastal =
      isCoastalBand(continentalness) && h > waterLevel + 1.2 && h <= waterLevel + 8
    const mountain = ridge >= 0.45 && altitude01 >= 0.35
    if (
      (coastal || mountain)
      && h > waterLevel + 0.5
      && sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT
      && footprintSlopeOk(wx, wz, TOWER_FOOTPRINT_RADIUS, SLOPE_REJECT_LANDMARK)
      && footprintClearsRoads(wx, wz, TOWER_FOOTPRINT_RADIUS)
      && !inVillageClearing(wx, wz, 4)
      && towerRandom() <= TOWER_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'tower',
        scale: 0.95 + towerRandom() * 0.2,
        rotationY: towerRandom() * Math.PI * 2,
        variant: coastal ? 0.25 + towerRandom() * 0.25 : 0.55 + towerRandom() * 0.4,
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'tower', 0),
      })
    }
  }

  // --- Old tree: rare natural landmark with clearing ---
  const oldTreeRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 10) ^ 0x93d02)
  {
    const wx = coord.cx * chunkSize + (oldTreeRandom() * 2 - 1) * (half - OLD_TREE_MARGIN)
    const wz = coord.cz * chunkSize + (oldTreeRandom() * 2 - 1) * (half - OLD_TREE_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const altitude = (h - waterLevel) / Math.max(heightScale, 0.001)
    const moistureRegion = sample(tile.moistureRegion, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const ridge = sample(tile.mountainRidge, wx, wz)
    const forestDensity = forestDensityAt(moistureRegion, altitude, continentalness, ridge, region)
    const biome = biomeWeightsAt(moistureRegion, altitude, region)
    const suitable =
      forestDensity >= 0.25 || biome.forest >= 0.35 || (biome.desert < 0.4 && biome.swamp < 0.45 && altitude > 0.08)
    if (
      suitable
      && h > waterLevel + 0.6
      && sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT
      && footprintSlopeOk(wx, wz, OLD_TREE_FOOTPRINT_RADIUS, SLOPE_REJECT_LANDMARK)
      && footprintClearsRoads(wx, wz, OLD_TREE_FOOTPRINT_RADIUS)
      && !inVillageClearing(wx, wz, 5)
      && oldTreeRandom() <= OLD_TREE_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'oldTree',
        scale: 0.95 + oldTreeRandom() * 0.2,
        rotationY: oldTreeRandom() * Math.PI * 2,
        variant: oldTreeRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'oldTree', 0),
      })
    }
  }

  // --- Shipwreck: very rare large coastal landmark ---
  const shipRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 11) ^ 0xa4e17)
  {
    const wx = coord.cx * chunkSize + (shipRandom() * 2 - 1) * (half - SHIPWRECK_MARGIN)
    const wz = coord.cz * chunkSize + (shipRandom() * 2 - 1) * (half - SHIPWRECK_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const continentalness = sample(tile.continentalness, wx, wz)
    const heightAbove = h - waterLevel
    const offsets = [
      [0, 0],
      [SHIPWRECK_FOOTPRINT_RADIUS * 0.55, 0],
      [-SHIPWRECK_FOOTPRINT_RADIUS * 0.55, 0],
      [0, SHIPWRECK_FOOTPRINT_RADIUS * 0.55],
      [0, -SHIPWRECK_FOOTPRINT_RADIUS * 0.55],
    ] as const
    let shoreHits = 0
    let shallowHits = 0
    let footprintOk = true
    for (const [dx, dz] of offsets) {
      const sx = wx + dx
      const sz = wz + dz
      const sh = sample(tile.heights, sx, sz) - waterLevel
      const sc = sample(tile.continentalness, sx, sz)
      if (!isCoastalBand(sc) && sc > region.coastThreshold + 0.08) {
        footprintOk = false
        break
      }
      if (slopeAt(sx, sz) > SLOPE_REJECT_FLAT) {
        footprintOk = false
        break
      }
      if (sh >= 0) shoreHits++
      if (sh < 0 && sh >= SHIPWRECK_MIN_HEIGHT_ABOVE_WATER) shallowHits++
    }
    if (
      footprintOk
      && isCoastalBand(continentalness)
      && heightAbove >= SHIPWRECK_MIN_HEIGHT_ABOVE_WATER
      && heightAbove <= SHIPWRECK_MAX_HEIGHT_ABOVE_WATER
      && shoreHits >= 2
      && (shallowHits >= 1 || heightAbove <= 1.2)
      && sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT
      && footprintClearsRoads(wx, wz, SHIPWRECK_FOOTPRINT_RADIUS)
      && !inVillageClearing(wx, wz, 6)
      && shipRandom() <= SHIPWRECK_CHANCE
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'shipwreck',
        scale: 0.95 + shipRandom() * 0.15,
        rotationY: shoreYawAt(wx, wz) + (shipRandom() - 0.5) * 0.5,
        variant: shipRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'shipwreck', 0),
      })
    }
  }

  return placements
}
