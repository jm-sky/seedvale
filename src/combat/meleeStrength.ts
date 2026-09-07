/**
 * Shared Strength → melee-damage rule (plan npc-019 §8) — the single pure
 * mapping both the player's and NPCs' melee-damage paths use, so Strength's
 * gameplay consequence is never duplicated across `app/gameLoop.ts` and
 * `ai/npcCombat.ts`. Linear, neutral at `Strength = 0.5` (preserves legacy
 * melee damage exactly):
 *
 * ```text
 * multiplier = 0.7 + strength * 0.6
 * 0.00 -> 0.70
 * 0.50 -> 1.00
 * 1.00 -> 1.30
 * ```
 *
 * This is a melee-owned consumer rule, not a `PhysicalAttributes` method —
 * the shared attribute primitive itself stays combat-agnostic (plan npc-019
 * §8).
 */

/** The shared SPEA neutral/reference point (`docs/world/species-physical-reference.md`) —
 *  Strength at this value must leave melee damage unchanged. */
export const MELEE_STRENGTH_NEUTRAL = 0.5

export function meleeStrengthMultiplier(strength: number): number {
  return 0.7 + strength * 0.6
}

/** Applies the shared Strength contribution to an already-resolved melee
 *  damage value (weapon base × sharpness, where applicable) — call this
 *  before critical-hit resolution (plan npc-019 §9/§10). */
export function applyMeleeStrength(baseDamage: number, strength: number): number {
  return baseDamage * meleeStrengthMultiplier(strength)
}
