import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import { biomeWeightsAt, forestBiomeAt, forestDensityAt } from '../../terrain/biomeRegions'
import {
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from '../../terrain/chunkHeightmap'
import { createSeededRandom } from '../parseSeed'

/** Stable catalog id — geometry reconstructs from world seed, never persisted. */
export const LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID = 'searchArea:lost-treasure-estate'

export const LOST_TREASURE_ESTATE_SEARCH_AREA_NAME = 'Okolice dawnego majątku'

const CANDIDATE_COUNT = 40
const MIN_HOME_DIST = 240
const MAX_HOME_DIST = 760
const SLOPE_REJECT = 0.75
const WATER_MARGIN = 0.35
const MIN_FOREST_FACTOR = 0.55
const AVOID_SITE_MIN_DIST = 90
const AREA_RADIUS_MIN = 100
const AREA_RADIUS_SPAN = 40

function hashMix(seed: number, salt: number): number {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

function slopeAt(sampleParams: RawSampleParams, x: number, z: number): number {
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
  avoid: { x: number, z: number } | null,
): boolean {
  if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < AVOID_SITE_MIN_DIST) return false
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
  avoid: { x: number, z: number } | null,
): number {
  if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < AVOID_SITE_MIN_DIST) return -10
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

export type LostTreasureEstateSearchArea = {
  locationId: typeof LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID
  x: number
  z: number
  radius: number
  name: typeof LOST_TREASURE_ESTATE_SEARCH_AREA_NAME
}

export type ResolveLostTreasureEstateSearchAreaInput = {
  seed: number
  homeX: number
  homeZ: number
  sampleParams: RawSampleParams
  /** Other authored forest site to stay clear of (plan quests-progression-009). */
  avoid?: { x: number, z: number } | null
}

/**
 * Deterministic bounded dark-forest estate search area (plan quests-progression-039).
 * Pure function of world seed + home settlement — never persisted, and does
 * not materialize the estate itself.
 *
 * @domain world
 */
export function resolveLostTreasureEstateSearchArea(
  input: ResolveLostTreasureEstateSearchAreaInput,
): LostTreasureEstateSearchArea {
  const { seed, homeX, homeZ, sampleParams } = input
  const avoid = input.avoid ?? null
  const rng = createSeededRandom(hashMix(seed, 0x039a_4e31))

  const candidates: { x: number, z: number, score: number }[] = []
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const angle = rng() * Math.PI * 2
    const dist = MIN_HOME_DIST + rng() * (MAX_HOME_DIST - MIN_HOME_DIST)
    const x = homeX + Math.cos(angle) * dist
    const z = homeZ + Math.sin(angle) * dist
    candidates.push({ x, z, score: scoreCandidate(sampleParams, x, z, homeX, homeZ, avoid) })
  }
  candidates.sort((a, b) => b.score - a.score)

  let chosen = candidates[0]!
  for (const tier of SITE_TIERS) {
    const hit = candidates.find((c) => candidatePassesTier(sampleParams, c.x, c.z, tier, avoid))
    if (hit) {
      chosen = hit
      break
    }
  }

  const radiusRng = createSeededRandom(hashMix(seed, 0x039b_81c4))
  const radius = AREA_RADIUS_MIN + radiusRng() * AREA_RADIUS_SPAN
  return {
    locationId: LOST_TREASURE_ESTATE_SEARCH_AREA_LOCATION_ID,
    x: chosen.x,
    z: chosen.z,
    radius,
    name: LOST_TREASURE_ESTATE_SEARCH_AREA_NAME,
  }
}
