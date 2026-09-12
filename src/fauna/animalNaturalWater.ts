import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { WaterBodyKind } from '../world/WaterSource'
import { oceanMixAt } from '../terrain/waterBodies'
import { resolveWaterBodyKind, shoreProbeHits } from '../terrain/waterBodyKind'

export type NaturalWaterKindSamplerDeps = {
  sampleHeight: HeightSampler
  waterLevel: number
  sampleContinentalness: (x: number, z: number) => number
  region: RegionParams
  riverShoreDistance: (x: number, z: number) => number | null
}

/** Classifies natural surface water at (x, z) the same way player drink/fill
 *  does (`app/interactables.ts` → `resolveWaterBodyShore`). `null` when the
 *  point is not a drinkable natural shore (dry land, deep interior, etc.). */
export function createNaturalWaterKindAt(
  deps: NaturalWaterKindSamplerDeps,
): (x: number, z: number) => WaterBodyKind | null {
  const { sampleHeight, waterLevel, sampleContinentalness, region, riverShoreDistance } = deps
  return (x, z) => {
    const hasShore = shoreProbeHits(x, z, sampleHeight, waterLevel) > 0
    const oceanMix = oceanMixAt(
      sampleContinentalness(x, z),
      region.oceanThreshold,
      region.coastThreshold,
    )
    return resolveWaterBodyKind(hasShore, oceanMix, riverShoreDistance(x, z))
  }
}
