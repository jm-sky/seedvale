/**
 * Shared Agility → melee-recovery rule (plan npc-022) — the single pure
 * mapping both the player's and NPCs' melee-attack paths use, so Agility's
 * gameplay consequence (cadence, not force) is never duplicated across
 * `player/playerMelee.ts` and `ai/NpcAgent.ts`. Linear, neutral at
 * `Agility = 0.5` (preserves legacy recovery exactly):
 *
 * ```text
 * multiplier = 1.2 - agility * 0.4
 * 0.0 -> 1.20
 * 0.5 -> 1.00
 * 0.6 -> 0.96
 * 1.0 -> 0.80
 * ```
 *
 * This only scales `MeleeConfig.recovery`; `windUp`/`hitWindow`/damage/range/
 * stamina cost are untouched (plan npc-022 — Agility affects cadence, not
 * force or animation speed). This is a melee-owned consumer rule, not a
 * `PhysicalAttributes` method — the shared attribute primitive itself stays
 * combat-agnostic (mirrors `combat/meleeStrength.ts`, plan npc-019 §8).
 */

/** The shared SPEA neutral/reference point (`docs/world/species-physical-reference.md`) —
 *  Agility at this value must leave melee recovery unchanged. */
export const MELEE_AGILITY_NEUTRAL = 0.5

/** Clamped so extreme/out-of-range Agility inputs can't collapse or explode
 *  recovery timing (plan npc-022 — "bounded so extreme attributes cannot
 *  collapse or explode attack timings"). */
export function meleeRecoveryMultiplier(agility: number): number {
  const clamped = Math.min(1, Math.max(0, agility))
  return 1.2 - clamped * 0.4
}

/** Resolves the actual recovery duration (seconds) for a melee attack from
 *  weapon base recovery + effective Agility — call once when the attack
 *  starts and snapshot the result; do not recompute mid-swing (plan
 *  npc-022). Weapon base recovery remains the source of truth for heavy/
 *  light attack identity; this only creates individual variation around it. */
export function resolveMeleeRecovery(baseRecovery: number, agility: number): number {
  return baseRecovery * meleeRecoveryMultiplier(agility)
}
