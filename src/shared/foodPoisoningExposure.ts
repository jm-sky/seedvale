import type { FoodSourceSpecies } from '../items/foodFreshness'
import type { ItemKind } from '../items/items'
import { createSeededRandom } from '../world/parseSeed'
import { applyPoisoningExposure, type TemporaryConditionsState } from './temporaryConditions'

/**
 * @domain shared
 * @system temporary-conditions
 * @role Deterministic raw-meat poisoning exposure roll (plan
 *  items-player-023) — the food counterpart of
 *  `waterPoisoningExposure.ts`. Kept in its own file rather than folded into
 *  the water module (different salt/event-index identity, so unrelated
 *  drinking events can never perturb a future unsafe-food roll).
 */

const FOOD_POISONING_SALT = 'food-poisoning-exposure'

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Stable `[0,1)` roll for one raw-meat consumption event that actually
 *  carries risk — separate events must use distinct `foodEventIndex` values
 *  so save/load cannot reroll the same meal. `kind`/`sourceSpecies` are part
 *  of the key so two different foods at the same index never collide. */
export function foodPoisoningExposureEventRoll(input: {
  worldSeed: number
  actorId: string
  foodEventIndex: number
  kind: ItemKind
  sourceSpecies?: FoodSourceSpecies
}): number {
  const key = `${input.worldSeed}:${input.actorId}:${input.foodEventIndex}:${input.kind}:${input.sourceSpecies ?? 'generic'}:${FOOD_POISONING_SALT}`
  return createSeededRandom(hashString(key))()
}

export function resolveRawMeatPoisoningExposure(input: { roll: number, chance: number }): boolean {
  return input.roll < input.chance
}

/** Applies poisoning when the roll succeeds; returns whether exposure was
 *  applied. Mirrors `waterPoisoningExposure.ts`'s
 *  `tryApplyUnsafeWaterPoisoningExposure` — the caller has already resolved
 *  `chance`/`severity` from `items/foodSafety.ts`. */
export function tryApplyRawMeatPoisoningExposure(
  conditions: TemporaryConditionsState,
  input: {
    nowDays: number
    roll: number
    chance: number
    severity: number
  },
): boolean {
  if (!resolveRawMeatPoisoningExposure({ roll: input.roll, chance: input.chance })) return false
  applyPoisoningExposure(conditions, input.nowDays, input.severity)
  return true
}
