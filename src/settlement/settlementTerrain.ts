import { MathUtils } from 'three'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { RegionParams } from '../terrain/chunkHeightmap'
import { biomeWeightsAt } from '../terrain/biomeRegions'

export type TerrainSamplers = {
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
}

/** Offsets (world units) around a site to average terrain axes over — a
 *  single sample lands on the flat spot `findSettlementSite` deliberately
 *  picked, which can miss the ocean/mountain/swamp/desert it's actually
 *  next to. */
const SAMPLE_OFFSETS: readonly { dx: number, dz: number }[] = [
  { dx: 0, dz: 0 },
  { dx: 60, dz: 0 },
  { dx: -60, dz: 0 },
  { dx: 0, dz: 60 },
  { dx: 0, dz: -60 },
]

/** mountainRidge is 0 off-ridge, ramping toward 1 on a crest — this is a low
 *  bar so a settlement merely in the foothills still reads as "mountain". */
const MOUNTAIN_RIDGE_THRESHOLD = 0.15

/**
 * Classifies the terrain around a settlement site for naming purposes, by
 * averaging the same macro axes (`continentalness`/`mountainRidge`/
 * `moistureRegion`) that `terrain/` already uses to render biomes — no
 * separate classification logic, just a different consumer of it.
 */
export function classifySettlementTerrain(
  x: number,
  z: number,
  y: number,
  waterLevel: number,
  heightScale: number,
  region: RegionParams,
  samplers: TerrainSamplers,
): SettlementTerrain {
  let continentalness = 0
  let mountainRidge = 0
  let moistureRegion = 0
  for (const { dx, dz } of SAMPLE_OFFSETS) {
    continentalness += samplers.sampleContinentalness(x + dx, z + dz)
    mountainRidge += samplers.sampleMountainRidge(x + dx, z + dz)
    moistureRegion += samplers.sampleMoistureRegion(x + dx, z + dz)
  }
  continentalness /= SAMPLE_OFFSETS.length
  mountainRidge /= SAMPLE_OFFSETS.length
  moistureRegion /= SAMPLE_OFFSETS.length

  if (continentalness < region.coastThreshold) return 'ocean'
  if (mountainRidge > MOUNTAIN_RIDGE_THRESHOLD) return 'mountain'

  const altitude01 = MathUtils.clamp((y - waterLevel) / Math.max(heightScale, 0.001), 0, 1)
  const weights = biomeWeightsAt(moistureRegion, altitude01, region)
  if (weights.swamp >= weights.desert && weights.swamp >= weights.forest) return 'swamp'
  if (weights.desert >= weights.forest) return 'desert'
  return 'forest'
}
