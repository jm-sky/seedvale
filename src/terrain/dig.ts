import type { HeightSampler } from '../player/PlayerController'
import { SAND_BAND } from './biomeColors'

/** Radius (world units) of one dig's terrain depression — see
 *  `ChunkManager.modifyTerrain()`. Large enough to read as a real hole while
 *  still merging nearby digs into one shared pit. */
export const DIG_RADIUS = 1.4
export const DIG_DEPTH_SOIL = 0.28
export const DIG_DEPTH_SAND = 0.14
export const STONE_CHANCE_SOIL = 0.45
export const STONE_CHANCE_SAND = 0.15
/** Chance that a found stone is noticed and goes to inventory (when there is
 *  capacity); otherwise it drops beside the hole. */
export const STONE_NOTICE_CHANCE = 0.65
/** Real-time seconds for dig / level channel before terrain + loot apply. */
export const DIG_DURATION_SEC = 2
/** Minimum depression vs procedural base before "Wyrównaj" is offered. */
export const LEVEL_EPS = 0.04

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

/** Env that can compare runtime height against procedural base — used for
 *  "Wyrównaj" eligibility. */
export type LevelEnv = {
  sampleHeight: HeightSampler
  sampleBaseHeight: HeightSampler
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

/** True when the runtime surface sits meaningfully below the procedural base
 *  (i.e. there is a dig depression worth leveling). */
export function canLevelAt(x: number, z: number, env: LevelEnv): boolean {
  return env.sampleHeight(x, z) < env.sampleBaseHeight(x, z) - LEVEL_EPS
}

export type DigStoneOutcome =
  | { kind: 'none' }
  | { kind: 'inventory' }
  | { kind: 'ground'; reason: 'unnoticed' | 'full' }

/** Pure stone-resolution after a successful dig roll — injectable RNG for tests. */
export function resolveDigStone(
  stoneChance: number,
  canAddStone: boolean,
  random: () => number = Math.random,
): DigStoneOutcome {
  if (random() >= stoneChance) return { kind: 'none' }
  if (!canAddStone) return { kind: 'ground', reason: 'full' }
  if (random() >= STONE_NOTICE_CHANCE) return { kind: 'ground', reason: 'unnoticed' }
  return { kind: 'inventory' }
}
