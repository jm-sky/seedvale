import { MathUtils } from 'three'
import type { RegionParams } from './chunkHeightmap'

export type BiomeWeights = {
  desert: number
  swamp: number
  forest: number
}

/** Altitude fraction (of `heightScale` above `waterLevel`) above which desert
 *  fades out — deserts stay low/mid-elevation, highlands read as bare
 *  rock/snow via `applyMountainRock` regardless of moisture. */
const DESERT_HIGHLAND_START = 0.55
const DESERT_HIGHLAND_END = 0.7

/** Swamp is gated to low, near-`waterLevel` altitude — it's a lowland/coastal
 *  feature, not a wet hillside. */
const SWAMP_ALTITUDE_START = 0.12
const SWAMP_ALTITUDE_END = 0.22

/**
 * Classifies a land texel into soft desert/swamp/forest weights from the
 * macro `moistureRegion` axis (`chunkHeightmap.ts`) + altitude. Mirrors the
 * continentalness/mountainRidge pattern: independent noise axis, smoothstep
 * bands, no hard edges. `forest` is the default/remainder — visually
 * unchanged from today's humid/arid blend where `desert`/`swamp` are ~0.
 */
export function biomeWeightsAt(
  moistureRegion: number,
  altitude01: number,
  region: RegionParams,
): BiomeWeights {
  const highlandFade = 1 - MathUtils.smoothstep(altitude01, DESERT_HIGHLAND_START, DESERT_HIGHLAND_END)
  const desertRaw =
    (1 -
      MathUtils.smoothstep(
        moistureRegion,
        region.desertThreshold,
        region.desertThreshold + region.desertThresholdWidth,
      )) *
    highlandFade

  const lowlandFade = 1 - MathUtils.smoothstep(altitude01, SWAMP_ALTITUDE_START, SWAMP_ALTITUDE_END)
  const swampRaw =
    MathUtils.smoothstep(
      moistureRegion,
      region.swampThreshold - region.swampThresholdWidth,
      region.swampThreshold,
    ) * lowlandFade

  const desert = Math.min(1, Math.max(0, desertRaw))
  const swamp = Math.min(1, Math.max(0, swampRaw)) * (1 - desert)
  const forest = Math.max(0, 1 - desert - swamp)

  return { desert, swamp, forest }
}

/** Moisture band where temperate land builds closed canopy (plan 063).
 *  Below → open / scattered trees; inside → dense forest; above → swamp gate
 *  via `biomeWeightsAt` already zeroes the forest remainder. */
const FOREST_CANOPY_START = 0.42
const FOREST_CANOPY_FULL = 0.54
const FOREST_CANOPY_END_START = 0.60
const FOREST_CANOPY_END = 0.72

/** Baseline canopy contribution on forest-capable land so open temperate
 *  terrain still supports isolated trees / weak habitat — never "no trees". */
const FOREST_OPEN_BASELINE = 0.10

/** Altitude suitability fade (fraction of heightScale above water). */
const FOREST_ALTITUDE_FADE_START = 0.32
const FOREST_ALTITUDE_FADE_END = 0.55

/** Mountain-ridge suitability fade — placement still hard-rejects strong
 *  crests; this softens habitat/density approaching them. */
const FOREST_RIDGE_FADE_START = 0.08
const FOREST_RIDGE_FADE_END = 0.32

/**
 * Continuous forest density / habitat suitability in `[0, 1]`.
 *
 * `0` ≈ open / poor forest habitat · `1` ≈ strong dense-forest environment.
 *
 * Built on existing macro axes (`moistureRegion` → `biomeWeightsAt`,
 * continentalness, altitude, mountainRidge). This is a suitability mapping for
 * vegetation density and fauna habitat (plan 063) — not a second biome system
 * and not a transferred grid.
 *
 * Slope, roads and clearings stay as placement constraints in
 * `computeChunkVegetation` rather than being baked into every sample.
 *
 * `forestDensity = 0` does **not** mean trees are forbidden; callers should
 * retain a baseline chance for isolated trees outside strong forest regions.
 */
export function forestDensityAt(
  moistureRegion: number,
  altitude01: number,
  continentalness: number,
  mountainRidge: number,
  region: RegionParams,
): number {
  if (altitude01 <= 0) return 0

  const land = MathUtils.smoothstep(
    continentalness,
    region.oceanThreshold,
    region.coastThreshold,
  )
  if (land <= 0) return 0

  const { forest: forestBiome } = biomeWeightsAt(moistureRegion, altitude01, region)
  if (forestBiome <= 0) return 0

  // Peaked moisture curve inside temperate land: open low-moisture temperate
  // stays sparse, humid mid-band builds closed canopy, then swamp/desert
  // weights (via `forestBiome`) gate the extremes.
  const canopyCore =
    MathUtils.smoothstep(moistureRegion, FOREST_CANOPY_START, FOREST_CANOPY_FULL) *
    (1 - MathUtils.smoothstep(moistureRegion, FOREST_CANOPY_END_START, FOREST_CANOPY_END))

  const macroTendency = forestBiome * (FOREST_OPEN_BASELINE + (1 - FOREST_OPEN_BASELINE) * canopyCore)
  const altitudeSuit = 1 - MathUtils.smoothstep(altitude01, FOREST_ALTITUDE_FADE_START, FOREST_ALTITUDE_FADE_END)
  const ridgeSuit = 1 - MathUtils.smoothstep(mountainRidge, FOREST_RIDGE_FADE_START, FOREST_RIDGE_FADE_END)

  return MathUtils.clamp(macroTendency * land * altitudeSuit * ridgeSuit, 0, 1)
}

/** Explicit forest-density classification (plan 182) — a discrete label other
 *  systems (quests, fauna, environment tuning) can query without re-deriving
 *  thresholds from `forestDensityAt()` themselves. Purely a read of the
 *  existing continuous signal: no parallel noise field, no per-chunk state. */
export type ForestBiome = 'open' | 'forest' | 'deepForest'

/** Below this `forestDensityAt()` value, land reads as open/scattered trees. */
const FOREST_BIOME_OPEN_MAX = 0.35
/** At/above this value, land reads as Deep Forest — chosen from the value
 *  distribution around `forestDensityAt()`'s canopy-core plateau (moisture
 *  ≈0.53–0.58 at ideal lowland/no-ridge conditions reaches 1.0; ≈0.72 keeps
 *  the deepForest band narrower than the full `forest` band so it forms a
 *  core inside ordinary forest rather than swallowing it). */
const FOREST_BIOME_DEEP_MIN = 0.72

/**
 * Classifies a continuous `forestDensityAt()` reading into the discrete
 * `open`/`forest`/`deepForest` biome (plan 182). Deterministic and pure —
 * same `forestDensity` always yields the same label, independent of chunk
 * coordinates or load order, since it depends only on the world-position
 * value already produced by `forestDensityAt()`.
 */
export function forestBiomeAt(forestDensity: number): ForestBiome {
  const fd = MathUtils.clamp(forestDensity, 0, 1)
  if (fd >= FOREST_BIOME_DEEP_MIN) return 'deepForest'
  if (fd >= FOREST_BIOME_OPEN_MAX) return 'forest'
  return 'open'
}
