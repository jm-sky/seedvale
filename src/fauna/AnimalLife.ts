/** Units/sec — same order of magnitude as NPC `Needs.ts` (0.028–0.04/sec). */
const HUNGER_RATE = 0.03
const THIRST_RATE = 0.032
/** Faster than regen so a sustained chase/flee visibly costs energy. */
const ENERGY_DRAIN_RATE = 0.18
const ENERGY_REGEN_RATE = 0.06
/** Below this, `AnimalAgent.wander()` has a chance to extend idle instead of
 *  picking a new wander target. */
export const ENERGY_REST_THRESHOLD = 0.35
/** Multiplier applied to wander radius/retarget timer when hunger/thirst is
 *  elevated — one shared strength for both (decision: no separate tuning). */
export const BIAS_STRENGTH = 0.6
/** `hunger`/`thirst` above this are considered "elevated" for wander bias and
 *  get drained on arrival — below it, wander behaves as before v1. */
export const NEED_ELEVATED_THRESHOLD = 0.5
/** Flat amount subtracted from an elevated hunger/thirst on arrival at a
 *  wander target — abstraction for "grazed/drank something along the way". */
export const NEED_RELIEF_ON_ARRIVAL = 0.25

export type AnimalLifeState = {
  hunger: number
  thirst: number
  energy: number
}

/** `offset` (0–1, per-instance) staggers hunger/thirst phase like
 *  `createNeedState`'s offset for NPC — without it, every animal of a kind
 *  would tick in lockstep. */
export function createAnimalLifeState(offset = 0): AnimalLifeState {
  return {
    hunger: 0.2 + offset * 0.3,
    thirst: 0.2 + ((offset + 0.4) % 1) * 0.3,
    energy: 1,
  }
}

export function tickAnimalLife(life: AnimalLifeState, dt: number, sprinting: boolean): void {
  life.hunger = Math.min(1, life.hunger + dt * HUNGER_RATE)
  life.thirst = Math.min(1, life.thirst + dt * THIRST_RATE)
  life.energy = sprinting
    ? Math.max(0, life.energy - dt * ENERGY_DRAIN_RATE)
    : Math.min(1, life.energy + dt * ENERGY_REGEN_RATE)
}

/** Subtracts a flat relief amount from any elevated hunger/thirst — call
 *  when an animal arrives at a wander target, abstracting "found something
 *  to eat/drink along the way" without any real food/water object. */
export function relieveElevatedNeeds(life: AnimalLifeState): void {
  if (life.hunger > NEED_ELEVATED_THRESHOLD) {
    life.hunger = Math.max(0, life.hunger - NEED_RELIEF_ON_ARRIVAL)
  }
  if (life.thirst > NEED_ELEVATED_THRESHOLD) {
    life.thirst = Math.max(0, life.thirst - NEED_RELIEF_ON_ARRIVAL)
  }
}
