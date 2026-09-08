/**
 * Human Strength → body carry-capacity rule (plan npc-020) — an explicit
 * human capability mapping, not kilograms-as-raw-SPEA and not a
 * species-general `strengthToKg()`. Linear, neutral at `Strength = 0.5`
 * (preserves the existing 20 kg human baseline exactly):
 *
 * ```text
 * capacityKg = 14 + strength * 12
 * 0.00 -> 14 kg
 * 0.50 -> 20 kg
 * 0.60 -> 21.2 kg
 * 1.00 -> 26 kg
 * ```
 *
 * The resolved value is continuous; do not round it for simulation.
 * Equipment `carryCapacityBonus` stays additive and separate — compose it
 * downstream via `Inventory.maxWeight`, never here.
 *
 * @domain items-player
 * @system human-carry-capacity
 * @role Maps resolved human Strength onto body carry capacity in kilograms.
 */

/** The shared SPEA neutral/reference point (`docs/world/species-physical-reference.md`) —
 *  Strength at this value must resolve to `HUMAN_CARRY_NEUTRAL_KG`. */
export const HUMAN_CARRY_STRENGTH_NEUTRAL = 0.5

/** Body carry capacity (kg) at `HUMAN_CARRY_STRENGTH_NEUTRAL` — the existing
 *  player inventory baseline, kept here so the mapping owns the number. */
export const HUMAN_CARRY_NEUTRAL_KG = 20

export function humanBodyCarryCapacityKg(strength: number): number {
  return 14 + strength * 12
}
