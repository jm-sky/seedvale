import {
  createStaminaState,
  drainStamina,
  restoreStamina,
  type StaminaState,
} from '../shared/StaminaState'

/** Units/sec — same order of magnitude as NPC `Needs.ts` (0.028–0.04/sec). */
const HUNGER_RATE = 0.03
const THIRST_RATE = 0.032
/** Faster than regen so a sustained chase/flee visibly costs stamina. */
const STAMINA_DRAIN_RATE = 0.18
const STAMINA_REGEN_RATE = 0.06
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
/** Full stamina capacity for animals — preserves the previous 0–1 energy scale. */
export const ANIMAL_STAMINA_MAX = 1

export type AnimalLifeState = {
  hunger: number
  thirst: number
  stamina: StaminaState
}

/** `offset` (0–1, per-instance) staggers hunger/thirst phase like
 *  `createNeedState`'s offset for NPC — without it, every animal of a kind
 *  would tick in lockstep. */
export function createAnimalLifeState(offset = 0): AnimalLifeState {
  return {
    hunger: 0.2 + offset * 0.3,
    thirst: 0.2 + ((offset + 0.4) % 1) * 0.3,
    stamina: createStaminaState(ANIMAL_STAMINA_MAX),
  }
}

export function tickAnimalLife(life: AnimalLifeState, dt: number, sprinting: boolean): void {
  life.hunger = Math.min(1, life.hunger + dt * HUNGER_RATE)
  life.thirst = Math.min(1, life.thirst + dt * THIRST_RATE)
  if (sprinting) {
    drainStamina(life.stamina, dt * STAMINA_DRAIN_RATE)
  } else {
    restoreStamina(life.stamina, dt * STAMINA_REGEN_RATE)
  }
}

/** Call once, on completion of a real eat action (forage or carcass) —
 *  `AnimalAgent` is responsible for only calling this after the animal has
 *  actually reached and finished eating at a source (plan 094). */
export function consumeFood(life: AnimalLifeState): void {
  life.hunger = Math.max(0, life.hunger - FOOD_RELIEF)
}

/** Call once, on completion of a real drink action at a shoreline — see
 *  `consumeFood()`'s caller contract. */
export function drinkWater(life: AnimalLifeState): void {
  life.thirst = Math.max(0, life.thirst - WATER_RELIEF)
}
