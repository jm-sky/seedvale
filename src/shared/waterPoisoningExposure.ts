import { createSeededRandom } from '../world/parseSeed'
import type { WaterSource } from '../world/WaterSource'
import {
  applyPoisoningExposure,
  UNSAFE_WATER_POISONING_EXPOSURE_CHANCE,
  type TemporaryConditionsState,
} from './temporaryConditions'

/**
 * @domain shared
 * @system temporary-conditions
 * @role Deterministic unsafe-water poisoning exposure roll (plan npc-024).
 */

const WATER_POISONING_SALT = 'water-poisoning-exposure'

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Stable `[0,1)` roll for one drink event — separate events must use distinct
 *  `drinkEventIndex` values so save/load cannot reroll the same action. */
export function waterPoisoningExposureEventRoll(input: {
  worldSeed: number
  actorId: string
  drinkEventIndex: number
  source: Pick<WaterSource, 'kind' | 'quality'>
}): number {
  const key = `${input.worldSeed}:${input.actorId}:${input.drinkEventIndex}:${input.source.kind}:${input.source.quality}:${WATER_POISONING_SALT}`
  return createSeededRandom(hashString(key))()
}

export function resolveUnsafeWaterPoisoningExposure(input: {
  roll: number
  exposureChance?: number
}): boolean {
  const chance = input.exposureChance ?? UNSAFE_WATER_POISONING_EXPOSURE_CHANCE
  return input.roll < chance
}

/** Applies poisoning when `source.quality === 'unsafe'` and the roll succeeds.
 *  Returns whether exposure was applied. Safe/undrinkable sources are no-ops. */
export function tryApplyUnsafeWaterPoisoningExposure(
  conditions: TemporaryConditionsState,
  input: {
    source: WaterSource
    nowDays: number
    roll: number
    exposureChance?: number
  },
): boolean {
  if (input.source.quality !== 'unsafe') return false
  if (!resolveUnsafeWaterPoisoningExposure({ roll: input.roll, exposureChance: input.exposureChance })) {
    return false
  }
  applyPoisoningExposure(conditions, input.nowDays)
  return true
}
