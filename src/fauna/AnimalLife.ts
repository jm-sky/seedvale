import { SLEEP_HUNGER_THIRST_RATE, type TickNeedsOptions } from '../ai/Needs'
import {
  createStaminaState,
  drainStamina,
  restoreStamina,
  type StaminaState,
} from '../shared/StaminaState'

export { SLEEP_HUNGER_THIRST_RATE }

/** Per-species basic physiology (plan fauna-010 §1) — the values every
 *  `AnimalDef` supplies and `createAnimalLifeState`/`tickAnimalLife` consume,
 *  replacing the single hardcoded rate/capacity set every species used to
 *  share. Units/scale match the pre-existing global constants this replaces
 *  (units/sec for the rates, the pre-existing 0–1 stamina scale for
 *  capacity) so a species using the old defaults behaves identically. */
export type AnimalMetabolismConfig = {
  hungerRate: number
  thirstRate: number
  staminaCapacity: number
  staminaDrainRate: number
  staminaRegenRate: number
}

/** Units/sec — same order of magnitude as NPC `Needs.ts` (0.028–0.04/sec).
 *  Kept as the fallback `AnimalMetabolismConfig` for callers/tests that
 *  construct life state without a species definition (plan fauna-010). */
const HUNGER_RATE = 0.03
const THIRST_RATE = 0.032
/** Faster than regen so a sustained chase/flee visibly costs stamina. */
const STAMINA_DRAIN_RATE = 0.18
const STAMINA_REGEN_RATE = 0.06
/** Full stamina capacity for animals — preserves the previous 0–1 energy scale. */
export const ANIMAL_STAMINA_MAX = 1

/** Fallback metabolism (plan fauna-010) — identical to every species'
 *  pre-existing shared rate/capacity, so `AnimalDef`s that don't (yet) tune
 *  their own `metabolism` behave exactly as before. */
export const DEFAULT_ANIMAL_METABOLISM: AnimalMetabolismConfig = {
  hungerRate: HUNGER_RATE,
  thirstRate: THIRST_RATE,
  staminaCapacity: ANIMAL_STAMINA_MAX,
  staminaDrainRate: STAMINA_DRAIN_RATE,
  staminaRegenRate: STAMINA_REGEN_RATE,
}

/** Below this ratio, `AnimalAgent.wander()` has a chance to extend idle instead of
 *  picking a new wander target. */
export const STAMINA_REST_THRESHOLD = 0.35
/** Multiplier applied to wander radius/retarget timer when hunger/thirst is
 *  elevated — one shared strength for both (decision: no separate tuning). */
export const BIAS_STRENGTH = 0.6
/** `hunger`/`thirst` above this are considered "elevated" — widens wander
 *  bias and is the threshold `AnimalAgent` uses to start searching for a
 *  real food/water source (plan 094). */
export const NEED_ELEVATED_THRESHOLD = 0.5
/** Flat amount subtracted from hunger by `consumeFood()` on a completed eat
 *  action — a real meal, not the old "grazed along the way" abstraction. */
export const FOOD_RELIEF = 0.5
/** Flat amount subtracted from thirst by `drinkWater()` on a completed
 *  drink action. */
export const WATER_RELIEF = 0.5

export type AnimalLifeState = {
  hunger: number
  thirst: number
  stamina: StaminaState
}

/** `offset` (0–1, per-instance) staggers hunger/thirst phase like
 *  `createNeedState`'s offset for NPC — without it, every animal of a kind
 *  would tick in lockstep. `metabolism` (plan fauna-010) supplies this
 *  individual's stamina capacity; defaults to `DEFAULT_ANIMAL_METABOLISM`
 *  for callers/tests that don't pass a species definition. */
export function createAnimalLifeState(
  offset = 0,
  metabolism: AnimalMetabolismConfig = DEFAULT_ANIMAL_METABOLISM,
): AnimalLifeState {
  return {
    hunger: 0.2 + offset * 0.3,
    thirst: 0.2 + ((offset + 0.4) % 1) * 0.3,
    stamina: createStaminaState(metabolism.staminaCapacity),
  }
}

/**
 * `swimExertion` (plan fauna-015 §6) — when set, the animal is currently
 * swimming and stamina drains at `staminaDrainRate * swimExertion` instead
 * of following `sprinting`/regen; `undefined` (the default) leaves the
 * pre-existing sprint-drains/otherwise-regens behaviour completely
 * unchanged. Locomotion/traversal (`AnimalAgent`/`waterTraversal.ts`) owns
 * *when* an animal is swimming — this only owns what that costs in the
 * shared stamina resource, so swimming never needs a second energy pool.
 */
export function tickAnimalLife(
  life: AnimalLifeState,
  dt: number,
  sprinting: boolean,
  options: TickNeedsOptions = {},
  metabolism: AnimalMetabolismConfig = DEFAULT_ANIMAL_METABOLISM,
  swimExertion?: number,
): void {
  const hungerThirstRate = options.hungerThirstRate ?? 1
  life.hunger = Math.min(1, life.hunger + dt * metabolism.hungerRate * hungerThirstRate)
  life.thirst = Math.min(1, life.thirst + dt * metabolism.thirstRate * hungerThirstRate)
  if (swimExertion !== undefined) {
    drainStamina(life.stamina, dt * metabolism.staminaDrainRate * swimExertion)
  } else if (sprinting) {
    drainStamina(life.stamina, dt * metabolism.staminaDrainRate)
  } else {
    restoreStamina(life.stamina, dt * metabolism.staminaRegenRate)
  }
}

/** Call once, on completion of a real eat action (forage or carcass) —
 *  `AnimalAgent` is responsible for only calling this after the animal has
 *  actually reached and finished eating at a source (plan 094).
 *  `reliefScale` (default 1, full `FOOD_RELIEF`) lets a lower-quality food
 *  source — a decaying corpse or bones (plan fauna-005), or a less-preferred
 *  diet item/grass patch (plan fauna-010) — grant proportionally less relief
 *  than a fresh kill or a fully preferred food source. */
export function consumeFood(life: AnimalLifeState, reliefScale = 1): void {
  life.hunger = Math.max(0, life.hunger - FOOD_RELIEF * reliefScale)
}

/** Call once, on completion of a real drink action at a shoreline — see
 *  `consumeFood()`'s caller contract. */
export function drinkWater(life: AnimalLifeState): void {
  life.thirst = Math.max(0, life.thirst - WATER_RELIEF)
}
