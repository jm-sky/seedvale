import type { ChunkCoord } from '../../terrain/chunkGrid'
import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { CaveDefinition } from '../caveVolume'
import { biomeWeightsAt, forestBiomeAt, forestDensityAt } from '../../terrain/biomeRegions'
import {
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from '../../terrain/chunkHeightmap'
import { openingDirection } from '../caves/caveOrientation'
import { createSeededRandom } from '../parseSeed'

/** Stable site key — encoded in `WorldLocation.id`, chest id and wolf-den ids. */
export const DARK_FOREST_TREASURE_SITE_KEY = 'dark-forest-treasure'

export const DARK_FOREST_TREASURE_LOCATION_ID = `ruins:${DARK_FOREST_TREASURE_SITE_KEY}`

export const DARK_FOREST_TREASURE_LANDMARK_ID = `ruins:${DARK_FOREST_TREASURE_SITE_KEY}`

export function darkForestTreasureChestId(): string {
  return `world-container:${DARK_FOREST_TREASURE_SITE_KEY}`
}

export function darkForestTreasureWolfDenId(ordinal: number): string {
  return `${DARK_FOREST_TREASURE_SITE_KEY}:wolfDen:${ordinal}`
}

export function darkForestTreasureMapPickupId(): string {
  return `treasure-map-pickup:${DARK_FOREST_TREASURE_SITE_KEY}`
}

/** World-location kinds eligible to host the physical treasure map. */
export type TreasureMapSourceKind = 'cave' | 'cemetery'

/**
 * Existing world place that owns the physical treasure-map pickup
 * (plan quests-progression-009 fix — not a quest-owned ring point).
 */
export type TreasureMapSourcePlace = {
  locationId: string
  kind: TreasureMapSourceKind
  /** Authoritative place center (cave entrance / cemetery). */
  x: number
  z: number
  pickupId: string
  pickupX: number
  pickupZ: number
}

export type DarkForestTreasureSite = {
  locationId: string
  landmarkId: string
  chestId: string
  x: number
  z: number
  rotationY: number
  variant: number
  scale: number
  wolfDenCount: number
  wolfDens: readonly { id: string, x: number, z: number }[]
  /** Set after caves/cemetery resolve — null only for the brief boot window
   *  before `attachTreasureMapSourcePlace`. */
  treasureMap: TreasureMapSourcePlace | null
}

export type DarkForestTreasureSiteInput = {
  seed: number
  homeX: number
  homeZ: number
  sampleParams: RawSampleParams
}

/** Preferred home→source band (world units). Matches large-cave ring scale. */
export const TREASURE_MAP_SOURCE_PREFERRED_MIN = 100
export const TREASURE_MAP_SOURCE_PREFERRED_MAX = 400

/** Catalog id for a production cave (`cave:${CaveDefinition.caveId}`). */
export function caveWorldLocationId(caveId: string): string {
  return `cave:${caveId}`
}

const CANDIDATE_COUNT = 40
const MIN_HOME_DIST = 220
const MAX_HOME_DIST = 720
const SLOPE_REJECT = 0.75
const WATER_MARGIN = 0.35
const MIN_FOREST_FACTOR = 0.55
const DEN_RING_MIN = 38
const DEN_RING_MAX = 58
const RUINS_FOOTPRINT_RADIUS = 14

function hashMix(seed: number, salt: number): number {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

function slopeAt(
  sampleParams: RawSampleParams,
  x: number,
  z: number,
): number {
  const d = 1.5
  const hx = sampleHeightAt(x + d, z, sampleParams) - sampleHeightAt(x - d, z, sampleParams)
  const hz = sampleHeightAt(x, z + d, sampleParams) - sampleHeightAt(x, z - d, sampleParams)
  return Math.hypot(hx, hz) / (2 * d)
}

function forestFactorAt(sampleParams: RawSampleParams, x: number, z: number): number {
  const floorH = sampleFloorAt(x, z, sampleParams)
  const altitude01 = (floorH - sampleParams.waterLevel) / Math.max(sampleParams.heightScale, 0.001)
  const moisture = sampleMoistureRegionAt(x, z, sampleParams)
  const continentalness = sampleContinentalnessAt(x, z, sampleParams)
  const ridge = sampleMountainRidgeAt(x, z, sampleParams)
  return forestDensityAt(moisture, altitude01, continentalness, ridge, sampleParams.region)
}

type SiteTier = {
  requireDeepForest: boolean
  minForestFactor: number
}

const SITE_TIERS: readonly SiteTier[] = [
  { requireDeepForest: true, minForestFactor: MIN_FOREST_FACTOR },
  { requireDeepForest: true, minForestFactor: 0.45 },
  { requireDeepForest: false, minForestFactor: 0.4 },
]

function candidatePassesTier(
  sampleParams: RawSampleParams,
  x: number,
  z: number,
  tier: SiteTier,
): boolean {
  const h = sampleHeightAt(x, z, sampleParams)
  if (h <= sampleParams.waterLevel + WATER_MARGIN) return false
  if (sampleContinentalnessAt(x, z, sampleParams) < sampleParams.region.oceanThreshold) return false
  if (slopeAt(sampleParams, x, z) > SLOPE_REJECT) return false
  const forest = forestFactorAt(sampleParams, x, z)
  if (forest < tier.minForestFactor) return false
  const biome = forestBiomeAt(forest)
  if (tier.requireDeepForest && biome !== 'deepForest') return false
  return true
}

function scoreCandidate(
  sampleParams: RawSampleParams,
  x: number,
  z: number,
  homeX: number,
  homeZ: number,
): number {
  const forest = forestFactorAt(sampleParams, x, z)
  const biome = forestBiomeAt(forest)
  const deepBonus = biome === 'deepForest' ? 0.35 : biome === 'forest' ? 0.1 : 0
  const dist = Math.hypot(x - homeX, z - homeZ)
  const distScore = dist >= MIN_HOME_DIST && dist <= MAX_HOME_DIST ? 0.2 : -1
  const floorH = sampleFloorAt(x, z, sampleParams)
  const altitude01 = (floorH - sampleParams.waterLevel) / Math.max(sampleParams.heightScale, 0.001)
  const moisture = sampleMoistureRegionAt(x, z, sampleParams)
  const biomeWeights = biomeWeightsAt(moisture, altitude01, sampleParams.region)
  const swampPenalty = biomeWeights.swamp * 0.4
  const ridge = sampleMountainRidgeAt(x, z, sampleParams)
  const ridgePenalty = ridge * 0.25
  return forest + deepBonus + distScore - swampPenalty - ridgePenalty
}

/**
 * Deterministic deep-forest treasure ruins site (plan quests-progression-009).
 * Pure function of world seed + home settlement — never persisted.
 *
 * @domain quests-progression
 */
export function resolveDarkForestTreasureSite(input: DarkForestTreasureSiteInput): DarkForestTreasureSite {
  const { seed, homeX, homeZ, sampleParams } = input
  const rng = createSeededRandom(hashMix(seed, 0x9d4f_009))

  const candidates: { x: number, z: number, score: number }[] = []
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const angle = rng() * Math.PI * 2
    const dist = MIN_HOME_DIST + rng() * (MAX_HOME_DIST - MIN_HOME_DIST)
    const x = homeX + Math.cos(angle) * dist
    const z = homeZ + Math.sin(angle) * dist
    candidates.push({ x, z, score: scoreCandidate(sampleParams, x, z, homeX, homeZ) })
  }
  candidates.sort((a, b) => b.score - a.score)

  let chosen = candidates[0]!
  for (const tier of SITE_TIERS) {
    const hit = candidates.find((c) => candidatePassesTier(sampleParams, c.x, c.z, tier))
    if (hit) {
      chosen = hit
      break
    }
  }

  const siteRng = createSeededRandom(hashMix(seed, 0x009a_4e31))
  const rotationY = siteRng() * Math.PI * 2
  const variant = siteRng()
  const scale = 1.15 + siteRng() * 0.25
  const wolfDenCount = siteRng() < 0.5 ? 2 : 3
  const wolfDens: { id: string, x: number, z: number }[] = []
  for (let i = 0; i < wolfDenCount; i++) {
    const a = rotationY + (i / wolfDenCount) * Math.PI * 2 + siteRng() * 0.4
    const r = DEN_RING_MIN + siteRng() * (DEN_RING_MAX - DEN_RING_MIN)
    wolfDens.push({
      id: darkForestTreasureWolfDenId(i),
      x: chosen.x + Math.cos(a) * r,
      z: chosen.z + Math.sin(a) * r,
    })
  }

  return {
    locationId: DARK_FOREST_TREASURE_LOCATION_ID,
    landmarkId: DARK_FOREST_TREASURE_LANDMARK_ID,
    chestId: darkForestTreasureChestId(),
    x: chosen.x,
    z: chosen.z,
    rotationY,
    variant,
    scale,
    wolfDenCount,
    wolfDens,
    treasureMap: null,
  }
}

export type TreasureMapSourceCandidate = {
  locationId: string
  kind: TreasureMapSourceKind
  x: number
  z: number
  /** Cave mouth yaw — required for cave placement beside the entrance. */
  yaw?: number
}

export type ResolveTreasureMapSourcePlaceInput = {
  seed: number
  homeX: number
  homeZ: number
  caves: readonly CaveDefinition[]
  /** Home settlement cemetery when no cave qualifies. */
  cemetery: { id: string, x: number, z: number } | null
  preferredMinDist?: number
  preferredMaxDist?: number
}

function caveSourceCandidate(def: CaveDefinition): TreasureMapSourceCandidate {
  return {
    locationId: caveWorldLocationId(def.caveId),
    kind: 'cave',
    x: def.entrance.x,
    z: def.entrance.z,
    yaw: def.entrance.yaw,
  }
}

function placePickupAtSource(
  seed: number,
  candidate: TreasureMapSourceCandidate,
): { pickupX: number, pickupZ: number } {
  const placeRng = createSeededRandom(hashMix(seed, hashMix(0x009a_4d31, hashMix(
    Math.round(candidate.x * 100),
    Math.round(candidate.z * 100),
  ))))
  if (candidate.kind === 'cave' && candidate.yaw !== undefined) {
    const out = openingDirection(candidate.yaw)
    // Outside the mouth on the approach pad — solid open-sky ground owned by
    // the cave site (not the carved mouth floor, which can fail water checks).
    const along = 3.4 + placeRng() * 0.8
    const side = (placeRng() < 0.5 ? -1 : 1) * (1.6 + placeRng() * 0.7)
    return {
      pickupX: candidate.x + out.dx * along - out.dz * side,
      pickupZ: candidate.z + out.dz * along + out.dx * side,
    }
  }
  const angle = placeRng() * Math.PI * 2
  const dist = 3.5 + placeRng() * 2.5
  return {
    pickupX: candidate.x + Math.cos(angle) * dist,
    pickupZ: candidate.z + Math.sin(angle) * dist,
  }
}

function pickDeterministicCandidate(
  seed: number,
  candidates: readonly TreasureMapSourceCandidate[],
): TreasureMapSourceCandidate {
  const ordered = [...candidates].sort((a, b) => a.locationId.localeCompare(b.locationId))
  const idx = hashMix(seed, 0x009a_4d31) % ordered.length
  return ordered[idx]!
}

/**
 * Picks an existing world place for the physical treasure map.
 * Prefer caves in a bounded home band; fall back to any cave, then cemetery.
 * Pure / deterministic — never scans loaded chunks.
 *
 * @domain quests-progression
 */
export function resolveTreasureMapSourcePlace(
  input: ResolveTreasureMapSourcePlaceInput,
): TreasureMapSourcePlace | null {
  const {
    seed,
    homeX,
    homeZ,
    caves,
    cemetery,
    preferredMinDist = TREASURE_MAP_SOURCE_PREFERRED_MIN,
    preferredMaxDist = TREASURE_MAP_SOURCE_PREFERRED_MAX,
  } = input

  const caveCandidates = caves.map(caveSourceCandidate)
  const inBand = caveCandidates.filter((c) => {
    const dist = Math.hypot(c.x - homeX, c.z - homeZ)
    return dist >= preferredMinDist && dist <= preferredMaxDist
  })
  const cavePool = inBand.length > 0 ? inBand : caveCandidates
  const chosen = cavePool.length > 0
    ? pickDeterministicCandidate(seed, cavePool)
    : cemetery
      ? { locationId: cemetery.id, kind: 'cemetery' as const, x: cemetery.x, z: cemetery.z }
      : null
  if (!chosen) return null

  const { pickupX, pickupZ } = placePickupAtSource(seed, chosen)
  return {
    locationId: chosen.locationId,
    kind: chosen.kind,
    x: chosen.x,
    z: chosen.z,
    pickupId: darkForestTreasureMapPickupId(),
    pickupX,
    pickupZ,
  }
}

/** Attaches a resolved map source onto an existing ruins site. */
export function withTreasureMapSourcePlace(
  site: DarkForestTreasureSite,
  treasureMap: TreasureMapSourcePlace,
): DarkForestTreasureSite {
  return { ...site, treasureMap }
}

/** Authored chest loot (plan 009 V1). */
export const DARK_FOREST_TREASURE_CHEST_COINS = 25

export function isDarkForestTreasureChestLooted(counts: Partial<Record<string, number>>): boolean {
  const coins = counts.coin ?? 0
  const rubies = counts.ruby ?? 0
  return coins === 0 && rubies === 0
}

export function siteChunkContainsPoint(
  coord: ChunkCoord,
  chunkSize: number,
  x: number,
  z: number,
): boolean {
  const half = chunkSize / 2
  const minX = coord.cx * chunkSize - half
  const maxX = coord.cx * chunkSize + half
  const minZ = coord.cz * chunkSize - half
  const maxZ = coord.cz * chunkSize + half
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ
}

export function ruinsDiscoveryRadius(): number {
  return RUINS_FOOTPRINT_RADIUS + 8
}
