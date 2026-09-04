/**
 * Shared pure terrain-classification rules (plan world-013 §2/notes §2) —
 * the exact wet/ocean/mountain gates the world map (`mapProjection.ts`) and
 * the lightweight World Locations coarse scan (`worldLocationCatalog.ts`)
 * must agree on bit-for-bit. Kept in one place so the two can never
 * silently drift apart; neither caller should redefine these conditions
 * locally.
 * @domain world
 */
import { oceanMixAt } from './waterBodies'

/** Same ridge bar `settlementTerrain` uses so foothills still read as mountain. */
export const MOUNTAIN_RIDGE_THRESHOLD = 0.15
/** Ocean vs. inland-water split of the `oceanMixAt` continentalness gate. */
export const OCEAN_MIX_GATE = 0.5

export function isWetFloor(floorH: number, waterLevel: number): boolean {
  return floorH < waterLevel - 1e-4
}

export function isOceanMix(continentalness: number, oceanThreshold: number, coastThreshold: number): boolean {
  return oceanMixAt(continentalness, oceanThreshold, coastThreshold) > OCEAN_MIX_GATE
}

export function isMountainRidge(ridge: number): boolean {
  return ridge > MOUNTAIN_RIDGE_THRESHOLD
}
