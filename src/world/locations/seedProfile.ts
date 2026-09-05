import { type RawSampleParams, sampleContinentalnessAt, sampleFloorAt, sampleMountainRidgeAt } from '../../terrain/chunkHeightmap'
import { isMountainRidge, isOceanMix, isWetFloor } from '../../terrain/terrainClassification'
import { createSeededRandom } from '../parseSeed'
import { LOCATION_SCAN_STEP } from './locationConfig'

/**
 * @domain world
 * @system seed-library
 * @role Cheap, no-materialization seed naming (plan world-015 §5/§6/§7) —
 *  samples a small fixed grid directly through the same analytic terrain
 *  primitives `worldLocationCatalog.ts`'s `classifyCoarseCell` uses, instead
 *  of going through `landmarksInRange()`/`coarseCellAt()`. A handful of
 *  direct `sample*At` calls at fixed offsets, never a scan, flood-fill or
 *  `WorldLocationCatalog` query — this must stay safe to call before any
 *  `ChunkManager`/`WorldBundle` exists (e.g. at boot, before `createApp`).
 */

/** 9×9 grid centered on the query origin — cheap enough to run synchronously
 *  at New Game time without a noticeable hitch (81 direct samples, no flood
 *  fill, no cache). */
const PROFILE_HALF_EXTENT_CELLS = 4

export type SeedTerrainProfile = {
  /** Inland (non-ocean) wet cells — rivers/lakes/marsh. */
  waterFraction: number
  oceanFraction: number
  mountainFraction: number
  sampledCells: number
}

/** Classifies the `(originX, originZ)`-centered starting area using only
 *  already-cheap analytic sampling (plan §5) — the same data a real New
 *  Game's starting chunks must compute anyway, at a much coarser stride. Safe
 *  to call for a seed that has never had a world built for it (no
 *  `ChunkManager` dependency). */
export function sampleStartupTerrainProfile(params: RawSampleParams, originX = 0, originZ = 0): SeedTerrainProfile {
  let water = 0
  let ocean = 0
  let mountain = 0
  let total = 0
  for (let gz = -PROFILE_HALF_EXTENT_CELLS; gz <= PROFILE_HALF_EXTENT_CELLS; gz++) {
    for (let gx = -PROFILE_HALF_EXTENT_CELLS; gx <= PROFILE_HALF_EXTENT_CELLS; gx++) {
      const wx = originX + gx * LOCATION_SCAN_STEP
      const wz = originZ + gz * LOCATION_SCAN_STEP
      total++
      const floorH = sampleFloorAt(wx, wz, params)
      if (isWetFloor(floorH, params.waterLevel)) {
        const continentalness = sampleContinentalnessAt(wx, wz, params)
        if (isOceanMix(continentalness, params.region.oceanThreshold, params.region.coastThreshold)) ocean++
        else water++
        continue
      }
      const ridge = sampleMountainRidgeAt(wx, wz, params)
      if (isMountainRidge(ridge)) mountain++
    }
  }
  return { waterFraction: water / total, oceanFraction: ocean / total, mountainFraction: mountain / total, sampledCells: total }
}

const BASE_BY_MOUNTAIN = ['Kamienne Wyżyny', 'Skaliste Turnie', 'Górskie Zbocza', 'Kamieniste Grzbiety']
const BASE_BY_WATER = ['Bagienna Dolina', 'Mokradła', 'Trzęsawiska', 'Wilgotna Nizina']
const BASE_DEFAULT = ['Leśne Wzgórza', 'Dębowa Nizina', 'Cicha Polana', 'Zielone Zagajniki', 'Sosnowe Wzgórza']

const SUFFIX_RIVER = ['nad Rzeką', 'nad Strumieniem']
const SUFFIX_LAKE = ['nad Jeziorem']
const SUFFIX_COAST = ['przy Wybrzeżu', 'nad Zatoką']
const SUFFIX_NONE = ['']

const MOUNTAIN_DOMINANT_THRESHOLD = 0.12
const WATER_DOMINANT_THRESHOLD = 0.12
const COASTAL_THRESHOLD = 0.08

function pick<T>(rand: () => number, pool: readonly T[]): T {
  return pool[Math.floor(rand() * pool.length)] ?? pool[0]!
}

/** Generated name (plan §6/§7) — set once at seed creation and never
 *  recomputed automatically. Deterministic in `seed` (and, when given, the
 *  cheap `profile` sampled above) so the same seed always proposes the same
 *  name; a missing `profile` (lazy backfill of a pre-Seed-Library save, no
 *  active world to sample) still yields a stable, plausible fallback. */
export function generateSeedName(seed: number, profile?: SeedTerrainProfile): string {
  const rand = createSeededRandom((seed ^ 0x5eed_1105) >>> 0)

  const mountainDominant = (profile?.mountainFraction ?? 0) >= MOUNTAIN_DOMINANT_THRESHOLD
  const waterDominant = (profile?.waterFraction ?? 0) >= WATER_DOMINANT_THRESHOLD
  const coastal = (profile?.oceanFraction ?? 0) >= COASTAL_THRESHOLD

  const base = mountainDominant ? pick(rand, BASE_BY_MOUNTAIN) : waterDominant ? pick(rand, BASE_BY_WATER) : pick(rand, BASE_DEFAULT)

  let suffixPool: readonly string[] = SUFFIX_NONE
  if (coastal) suffixPool = SUFFIX_COAST
  else if (waterDominant && mountainDominant) suffixPool = SUFFIX_LAKE
  else if ((profile?.waterFraction ?? 0) > 0 && !waterDominant) suffixPool = SUFFIX_RIVER

  const suffix = pick(rand, suffixPool)
  return suffix ? `${base} ${suffix}` : base
}
