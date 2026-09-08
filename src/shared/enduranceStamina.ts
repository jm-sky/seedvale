/**
 * @domain shared
 * @system physical-attributes
 * @role Shared Endurance → Stamina capability resolvers (plan npc-021).
 *  Pure mapping from effective Endurance to max Stamina and recovery
 *  multiplier — consumer-agnostic; activity drain rates stay owned by each
 *  consumer. `StaminaState` remains the mutable `{ max, current }` pool.
 * @uses PhysicalAttributes
 */

/** Linear Endurance → max Stamina mapping — neutral at `Endurance = 0.5`
 *  (`100`), full SPEA range ±30% (`70`..`130`). Simulation values stay
 *  continuous floats; presentation may round independently. */
export function resolveMaxStaminaFromEndurance(endurance: number): number {
  return 70 + endurance * 60
}

/** Linear Endurance → Stamina recovery multiplier — neutral at
 *  `Endurance = 0.5` (`1.00×`), range `0.70×`..`1.30×`. Composes with each
 *  consumer's own base recovery rate and independent modifiers (e.g. NPC
 *  `energetic`). */
export function resolveEnduranceStaminaRecoveryMultiplier(endurance: number): number {
  return 0.7 + endurance * 0.6
}

/** Runtime max-capacity invariant (plan npc-021): clamp `current` when max
 *  decreases; never grant free Stamina when max increases. */
export function applyDerivedStaminaMax(stamina: { max: number, current: number }, newMax: number): void {
  stamina.max = newMax
  stamina.current = Math.min(stamina.current, newMax)
}
