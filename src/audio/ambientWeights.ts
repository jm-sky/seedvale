import { MathUtils } from 'three'
import type { RegionParams } from '../terrain/chunkHeightmap'
import { biomeWeightsAt } from '../terrain/biomeRegions'

export type AmbientWeights = { ocean: number, forest: number, mountain: number }

/** Subset of what `ChunkManager` (`src/terrain/chunkManager.ts`) already
 *  exposes — pass it straight through from there, don't duplicate a sampler. */
export type AmbientSamplers = {
  sampleFloor: (x: number, z: number) => number
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
  waterLevel: number
  heightScale: number
  region: RegionParams
}

/** How much further inland (in continentalness units) past `coastThreshold`
 *  the surf is still audible — audio-only tuning, doesn't touch
 *  `RegionParams` (which drives terrain generation, not sound). */
const COAST_AUDIO_FADE = 0.08
/** `altitude01` (as in `biomeColors.ts`) above which mountain wind is heard
 *  regardless of standing exactly on a `mountainRidge` texel. */
const HIGHLAND_WIND_START = 0.55
const HIGHLAND_WIND_END = 0.75

/** Composes existing terrain samplers into per-layer ambient gains (0-1) at a
 *  world position — mirrors what the player sees (same thresholds as
 *  `buildChunkGeometry.ts`/`biomeRegions.ts`), just resampled at the player's
 *  own position instead of per-vertex. */
export function ambientWeightsAt(x: number, z: number, s: AmbientSamplers): AmbientWeights {
  const continentalness = s.sampleContinentalness(x, z)
  const ocean = 1 - MathUtils.smoothstep(
    continentalness,
    s.region.oceanThreshold,
    s.region.coastThreshold + COAST_AUDIO_FADE,
  )

  const floorH = s.sampleFloor(x, z)
  const altitude01 = MathUtils.clamp(
    (floorH - s.waterLevel) / Math.max(s.heightScale, 0.001),
    0,
    1,
  )
  const { forest } = biomeWeightsAt(s.sampleMoistureRegion(x, z), altitude01, s.region)

  const highland = MathUtils.smoothstep(altitude01, HIGHLAND_WIND_START, HIGHLAND_WIND_END)
  const mountain = Math.max(s.sampleMountainRidge(x, z), highland)

  return { ocean, forest: forest * (1 - ocean) * (1 - mountain), mountain }
}
