import type { ChunkCoord } from './chunkGrid'
import type { VegetationPlacement } from './chunkVegetation'
import { distanceToSegment } from '../math/segment'
import { cemeteryGraveLayout, type CemeterySize } from '../settlement/props'
import { createSeededRandom } from '../world/parseSeed'
import { biomeWeightsAt, forestDensityAt } from './biomeRegions'
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
  | 'cemetery'

export type EnvironmentPlacement = {
  x: number
  z: number
  kind: EnvironmentKind
  scale: number
  rotationY: number
  /** Meaning depends on `kind`: boulder irregularity 0..1 (`largeRock`/
   *  `rockCluster`), log length in world units (`fallenLog`), unused
   *  (`campfire`), height/count/damage variation 0..1 (`monolith`/
   *  `stoneCircle`/`smallRuins`/`cemetery`) — see `createLargeRock`/
   *  `createRockCluster`/`createFallenLog`/`createMonolith`/
   *  `createStoneCircle`/`createSmallRuins`/`createCemetery`
   *  in `settlement/props.ts`. */
  variant: number
  /** Stable identity, present only for the four proper "landmark" kinds
   *  (`monolith`/`stoneCircle`/`smallRuins`/`cemetery`) — purely derived from
   *  `(seed, chunk, kind, ordinal)`, so it regenerates identically on every
   *  chunk reload without needing save-game persistence (plan 110). Absent
   *  for the purely decorative kinds (rock/log/campfire), which have no
   *  identity need. See `deriveLandmarkId`. */
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
/** Village-fringe filter is the real rarity gate; within that band most
 *  settlements should roll ~one cemetery rather than 1-in-30. */
const CEMETERY_CHANCE = 0.28
/** Multi-point landmarks want sturdier, flatter footing than a single rock. */
const SLOPE_REJECT_LANDMARK = 0.6
/** Keep the whole landmark footprint inside its own chunk (simpler than
 *  cross-chunk ownership — see implementation notes' "Chunk boundaries"). */
const MONOLITH_MARGIN = 1.2
const STONE_CIRCLE_MARGIN = 4
const SMALL_RUINS_MARGIN = 2.5
/** Per-size cemetery margin (plan 173) — keeps the whole grave-grid footprint
 *  inside its own chunk (see `createCemetery`'s `CEMETERY_LAYOUTS`); LG's
 *  wider block/aisle layout needs more clearance from the chunk edge than SM. */
const CEMETERY_MARGIN_BY_SIZE: Record<CemeterySize, number> = { SM: 6, MD: 9, LG: 14 }
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

/** The four `EnvironmentKind`s that carry a stable `EnvironmentPlacement.id`
 *  (plan 110) — the only ones a landmark quest can target (plan 132). */
export type LandmarkKind = 'monolith' | 'stoneCircle' | 'smallRuins' | 'cemetery'

/** Display label for interaction prompts/dialogue speaker names (plan 132) —
 *  same role as `ANIMAL_LABELS`/`SPAWNER_LABELS` for their own domains. */
export const LANDMARK_LABELS: Record<LandmarkKind, string> = {
  monolith: 'Monolit',
  stoneCircle: 'Krąg kamieni',
  smallRuins: 'Ruiny',
  cemetery: 'Cmentarz',
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

/** Stable id for one of the four proper landmark kinds — pure function of
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

/** Cemetery-only extraction (plan world-014) of the cemetery block below —
 *  pure and worker-safe given any `CemeteryTerrainSampler`, so it is the one
 *  place that owns the cemetery RNG stream/gates/identity for both a fully
 *  generated chunk (`computeChunkEnvironment`) and a lightweight unloaded
 *  lookup (`ChunkManager.findLandmarkNear`'s cold-path fallback). Not
 *  extended to monolith/stoneCircle/smallRuins — those are not on the World
 *  Location cold path this plan fixes.
 *
 *  Determinism/parity contract: for the same `(coord, params)`, this must
 *  return the same result whether `terrain` is backed by a full generated
 *  tile or the lightweight sampler — same RNG draws (nothing here reads
 *  `terrain` before the RNG stream itself is exhausted in the same order),
 *  same acceptance gates, same `EnvironmentPlacement` (including `null`).
 * @domain world-terrain
 */
export function resolveCemeteryPlacement(
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): EnvironmentPlacement | null {
  const { chunkSize } = params
  const half = chunkSize / 2
  const cemeteryRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 7) ^ 0x6a18d)
  const cemeterySize = rollCemeterySize(cemeteryRandom)
  const margin = CEMETERY_MARGIN_BY_SIZE[cemeterySize]
  const wx = coord.cx * chunkSize + (cemeteryRandom() * 2 - 1) * (half - margin)
  const wz = coord.cz * chunkSize + (cemeteryRandom() * 2 - 1) * (half - margin)
  // Rolled here (not at push time) so the footprint check below can size
  // itself off the real scale, not a placeholder.
  const cemeteryScale = 0.9 + cemeteryRandom() * 0.3
  const h = terrain.heightAt(wx, wz)
  const d = SLOPE_SAMPLE_STEP
  const slope =
    (Math.abs(terrain.heightAt(wx + d, wz) - terrain.heightAt(wx - d, wz)) +
      Math.abs(terrain.heightAt(wx, wz + d) - terrain.heightAt(wx, wz - d))) /
    (2 * d)
  if (
    h > params.waterLevel + 0.3 &&
    terrain.roadTintAt(wx, wz) <= ROAD_TINT_REJECT &&
    slope <= SLOPE_REJECT_LANDMARK &&
    cemeteryFitsVillageFringe(wx, wz, params.regional, params.clearings) &&
    cemeteryFootprintClearsRoads(wx, wz, cemeterySize, cemeteryScale, params.roadSegments) &&
    cemeteryRandom() <= CEMETERY_CHANCE
  ) {
    return {
      x: wx,
      z: wz,
      kind: 'cemetery',
      scale: cemeteryScale,
      rotationY: cemeteryRandom() * Math.PI * 2,
      variant: cemeteryRandom(),
      cemeterySize,
      id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'cemetery', 0),
    }
  }
  return null
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

  const chanceBiasAt = (kind: LandmarkBiasKind, wx: number, wz: number, h: number, slope: number): number => {
    const altitude01 = (h - waterLevel) / Math.max(heightScale, 0.001)
    const biome = biomeWeightsAt(sample(tile.moistureRegion, wx, wz), altitude01, region)
    return landmarkChanceBias(kind, {
      mountainRidge: sample(tile.mountainRidge, wx, wz),
      altitude01,
      slope,
      desert: biome.desert,
      swamp: biome.swamp,
      forest: biome.forest,
    })
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

  // --- Monolith: single standing stone, "częste" landmark tier ---
  const monolithRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 4) ^ 0x1d4b7)
  {
    const wx = coord.cx * chunkSize + (monolithRandom() * 2 - 1) * (half - MONOLITH_MARGIN)
    const wz = coord.cz * chunkSize + (monolithRandom() * 2 - 1) * (half - MONOLITH_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const slope = slopeAt(wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slope <= SLOPE_REJECT_LANDMARK &&
      monolithRandom() <= MONOLITH_CHANCE * chanceBiasAt('monolith', wx, wz, h, slope)
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'monolith',
        scale: 0.85 + monolithRandom() * 0.5,
        rotationY: monolithRandom() * Math.PI * 2,
        variant: monolithRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'monolith', 0),
      })
    }
  }

  // --- Stone circle: small "rzadkie" landmark tier ---
  const stoneCircleRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 5) ^ 0x3ea92)
  {
    const wx = coord.cx * chunkSize + (stoneCircleRandom() * 2 - 1) * (half - STONE_CIRCLE_MARGIN)
    const wz = coord.cz * chunkSize + (stoneCircleRandom() * 2 - 1) * (half - STONE_CIRCLE_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const slope = slopeAt(wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slope <= SLOPE_REJECT_LANDMARK &&
      stoneCircleRandom() <= STONE_CIRCLE_CHANCE * chanceBiasAt('stoneCircle', wx, wz, h, slope)
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'stoneCircle',
        scale: 0.9 + stoneCircleRandom() * 0.4,
        rotationY: stoneCircleRandom() * Math.PI * 2,
        variant: stoneCircleRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'stoneCircle', 0),
      })
    }
  }

  // --- Small ruins: low wall/foundation fragment, "rzadkie" landmark tier ---
  const ruinsRandom = createSeededRandom(params.seed ^ hashChunk(coord.cx, coord.cz, 6) ^ 0x57c31)
  {
    const wx = coord.cx * chunkSize + (ruinsRandom() * 2 - 1) * (half - SMALL_RUINS_MARGIN)
    const wz = coord.cz * chunkSize + (ruinsRandom() * 2 - 1) * (half - SMALL_RUINS_MARGIN)
    const h = sample(tile.heights, wx, wz)
    const slope = slopeAt(wx, wz)
    if (
      h > waterLevel + 0.3 &&
      sample(tile.roadTint, wx, wz) <= ROAD_TINT_REJECT &&
      slope <= SLOPE_REJECT_LANDMARK &&
      ruinsRandom() <= SMALL_RUINS_CHANCE * chanceBiasAt('smallRuins', wx, wz, h, slope)
    ) {
      placements.push({
        x: wx,
        z: wz,
        kind: 'smallRuins',
        scale: 0.85 + ruinsRandom() * 0.4,
        rotationY: ruinsRandom() * Math.PI * 2,
        variant: ruinsRandom(),
        id: deriveLandmarkId(params.seed, coord.cx, coord.cz, 'smallRuins', 0),
      })
    }
  }

  // --- Cemetery: rare village-fringe landmark (plan 049), SM/MD/LG (plan 173) ---
  // Extracted to `resolveCemeteryPlacement` (plan world-014) so the same
  // RNG/gating/identity logic backs both this full generation path and the
  // unloaded-chunk lightweight lookup in `ChunkManager.findLandmarkNear`.
  const cemeteryPlacement = resolveCemeteryPlacement(coord, params, {
    heightAt: (wx, wz) => sample(tile.heights, wx, wz),
    roadTintAt: (wx, wz) => sample(tile.roadTint, wx, wz),
  })
  if (cemeteryPlacement) placements.push(cemeteryPlacement)

  return placements
}
