import type { HeightSampler } from '../player/PlayerController'
import { SAND_BAND } from './biomeColors'

/** Radius (world units) of one dig's terrain depression — see
 *  `ChunkManager.modifyTerrain()`. Small enough that a handful of nearby digs
 *  read as a shared shallow pit rather than a crater. */
export const DIG_RADIUS = 0.75
const DIG_DEPTH_SOIL = 0.12
const DIG_DEPTH_SAND = 0.06
const STONE_CHANCE_SOIL = 0.45
const STONE_CHANCE_SAND = 0.15

/** `sampleMountainRidge` above this reads as bare mountain rock (see
 *  `biomeColors.ts`'s `applyMountainRock` — starts blending toward `ROCK`/
 *  `SNOW` as soon as this is > 0). Digging is rejected well before the
 *  surface visually looks like solid stone, not exactly at that blend's
 *  first pixel. */
const ROCK_MOUNTAIN_RIDGE_THRESHOLD = 0.3
/** Minimum clearance above `waterLevel` for a dig to be allowed — rejects
 *  water/seabed and the immediate shoreline. */
const WATER_MARGIN = 0.1

export type DigProfile = { depth: number, stoneChance: number }

/** Narrow structural subset of `ChunkManager` — `ChunkManager` satisfies this
 *  by duck typing, but keeping it separate lets pure logic/tests construct a
 *  plain object instead of a real chunk manager (same pattern as
 *  `naturalResources.ts`'s `ResourceEnv`). */
export type DigEnv = {
  sampleHeight: HeightSampler
  sampleMountainRidge: (x: number, z: number) => number
  waterLevel: number
}

/** Classifies the ground at `(x, z)` for digging — `null` means not diggable
 *  (rock/mountain or water/seabed), matching the plan's soil table without a
 *  full terrain-type taxonomy: reuses the exact same signals (`mountainRidge`,
 *  height vs. `waterLevel` + `SAND_BAND`) `buildChunkGeometry.ts`'s coloring
 *  already keys off, so "looks like rock/sand" and "digs like rock/sand" stay
 *  in sync without a second terrain-type system. */
export function getDigProfileAt(x: number, z: number, env: DigEnv): DigProfile | null {
  const height = env.sampleHeight(x, z)
  if (height < env.waterLevel + WATER_MARGIN) return null
  if (env.sampleMountainRidge(x, z) > ROCK_MOUNTAIN_RIDGE_THRESHOLD) return null
  const isSand = height < env.waterLevel + SAND_BAND
  return isSand
    ? { depth: DIG_DEPTH_SAND, stoneChance: STONE_CHANCE_SAND }
    : { depth: DIG_DEPTH_SOIL, stoneChance: STONE_CHANCE_SOIL }
}
