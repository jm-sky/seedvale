import type { HeightSampler } from '../player/PlayerController'
import { sandBandAt } from './biomeColors'

/** Radius (world units) of one dig's terrain depression — see
 *  `ChunkManager.modifyTerrain()`. Large enough to read as a real hole while
 *  still merging nearby digs into one shared pit. */
export const DIG_RADIUS = 1.4
export const DIG_DEPTH_SOIL = 0.28
export const DIG_DEPTH_SAND = 0.14
export const DIG_DEPTH_ROCK = 0.22
export const STONE_CHANCE_SOIL = 0.45
export const STONE_CHANCE_SAND = 0.15
export const STONE_CHANCE_ROCK = 0.8
/** Chance that a found stone is noticed and goes to inventory (when there is
 *  capacity); otherwise it drops beside the hole. */
export const STONE_NOTICE_CHANCE = 0.65
/** Real-time seconds for dig / level / mound channel before terrain applies. */
export const DIG_DURATION_SEC = 2

/** `sampleMountainRidge` above this reads as bare mountain rock (see
 *  `biomeColors.ts`'s `applyMountainRock` — starts blending toward `ROCK`/
 *  `SNOW` as soon as this is > 0). Digging is rejected well before the
 *  surface visually looks like solid stone, not exactly at that blend's
 *  first pixel. */
export const ROCK_MOUNTAIN_RIDGE_THRESHOLD = 0.3
/** Minimum clearance above `waterLevel` for a dig to be allowed — rejects
 *  water/seabed and the immediate shoreline. */
const WATER_MARGIN = 0.1

export type DigSurface = 'rock' | 'sand' | 'soil'

export type DigProfile = { depth: number, stoneChance: number, surface: DigSurface }

/** Narrow structural subset of `ChunkManager` — `ChunkManager` satisfies this
 *  by duck typing, but keeping it separate lets pure logic/tests construct a
 *  plain object instead of a real chunk manager (same pattern as
 *  `naturalResources.ts`'s `ResourceEnv`). */
export type DigEnv = {
  sampleHeight: HeightSampler
  sampleMountainRidge: (x: number, z: number) => number
  waterLevel: number
  /** World seed — same value coloring/grass use for `sandBandAt`. */
  seed: number
}

/** True when `(x, z)` is bare mountain rock — the same ridge signal shovel
 *  digging already rejects. Steep grassy slopes are not rock. */
export function isRockGround(x: number, z: number, env: DigEnv): boolean {
  return env.sampleMountainRidge(x, z) > ROCK_MOUNTAIN_RIDGE_THRESHOLD
}

/** Classifies the ground at `(x, z)` for digging — `null` means not diggable
 *  (rock/mountain or water/seabed), matching the plan's soil table without a
 *  full terrain-type taxonomy: reuses the exact same signals (`mountainRidge`,
 *  height vs. `waterLevel` + local `sandBandAt`) `buildChunkGeometry.ts`'s
 *  coloring already keys off, so "looks like rock/sand" and "digs like
 *  rock/sand" stay in sync without a second terrain-type system. */
export function getDigProfileAt(x: number, z: number, env: DigEnv): DigProfile | null {
  const height = env.sampleHeight(x, z)
  if (height < env.waterLevel + WATER_MARGIN) return null
  if (isRockGround(x, z, env)) return null
  const isSand = height < env.waterLevel + sandBandAt(x, z, env.seed)
  return isSand
    ? { depth: DIG_DEPTH_SAND, stoneChance: STONE_CHANCE_SAND, surface: 'sand' }
    : { depth: DIG_DEPTH_SOIL, stoneChance: STONE_CHANCE_SOIL, surface: 'soil' }
}

/** Pickaxe-only counterpart of `getDigProfileAt` — soil/sand return null;
 *  mountain rock (and dry land above water) returns a rock profile. */
export function getRockDigProfileAt(x: number, z: number, env: DigEnv): DigProfile | null {
  const height = env.sampleHeight(x, z)
  if (height < env.waterLevel + WATER_MARGIN) return null
  if (!isRockGround(x, z, env)) return null
  return { depth: DIG_DEPTH_ROCK, stoneChance: STONE_CHANCE_ROCK, surface: 'rock' }
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
