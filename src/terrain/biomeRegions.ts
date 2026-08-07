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
