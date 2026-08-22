import type { WorldConfig } from '../config/worldConfig'
import type { HeightSampler } from '../player/PlayerController'
import type { ForestBiome } from '../terrain/biomeRegions'
import type { RegionParams } from '../terrain/chunkHeightmap'
import type { ChunkManager } from '../terrain/chunkManager'
import type { DayNightState } from './dayNight'
import type { TreeEnvSample } from './treeLifecycle'
import { skyParamsFromTime } from './dayNight'

/** Small, read-only view over seed/terrain-sampling/day-night state — the
 *  consolidated replacement for the several hand-built sampler adapters
 *  (`AmbientSamplers`, `ResourceEnv`, the inline settlement terrain-sampler
 *  literal) that used to independently re-expose the same
 *  `chunkManager.sample*`/`waterLevel`/`config.terrain.*` values. Data-only:
 *  no system references (no `ChunkManager`/`TreeLifecycle` instance), no
 *  mutation. See docs/reviews/2026-08-14--006--architecture-alignment.md §7.1. */
export type WorldContext = {
  readonly seed: number
  sampleHeight: HeightSampler
  sampleFloor: HeightSampler
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleMoistureRegion: (x: number, z: number) => number
  sampleForestFactor: (x: number, z: number) => number
  sampleForestBiome: (x: number, z: number) => ForestBiome
  sampleTreeEnv: (x: number, z: number) => TreeEnvSample
  readonly waterLevel: number
  readonly heightScale: number
  readonly region: RegionParams
  readonly timeOfDay: number
  readonly elapsedDays: number
  readonly dayFactor: number
}

/** `getChunkManager` lets callers pick the lifetime: `() => bundle.chunkManager`
 *  for a `WorldContext` that must survive `rebuildWorldBundle()` reassigning
 *  the field, or `() => chunkManager` (a call-local const) for one that's fine
 *  being rebuilt fresh alongside its own consumer. */
export function createWorldContext(
  getChunkManager: () => ChunkManager,
  config: WorldConfig,
  dayNight: DayNightState,
): WorldContext {
  return {
    get seed() { return config.seed },
    sampleHeight: (x, z) => getChunkManager().sampleHeight(x, z),
    sampleFloor: (x, z) => getChunkManager().sampleFloor(x, z),
    sampleContinentalness: (x, z) => getChunkManager().sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => getChunkManager().sampleMountainRidge(x, z),
    sampleMoistureRegion: (x, z) => getChunkManager().sampleMoistureRegion(x, z),
    sampleForestFactor: (x, z) => getChunkManager().sampleForestFactor(x, z),
    sampleForestBiome: (x, z) => getChunkManager().sampleForestBiome(x, z),
    sampleTreeEnv: (x, z) => getChunkManager().sampleTreeEnv(x, z),
    get waterLevel() { return getChunkManager().waterLevel },
    get heightScale() { return config.terrain.heightScale },
    get region() { return config.terrain.region },
    get timeOfDay() { return dayNight.timeOfDay },
    get elapsedDays() { return dayNight.elapsedDays },
    get dayFactor() { return skyParamsFromTime(dayNight.timeOfDay).dayFactor },
  }
}
