import type { CombatTargetHandle } from '../combat/combatIntent'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import { MELEE_CRITICAL_CHANCE, MELEE_CRITICAL_MULTIPLIER, resolveCriticalHit } from '../combat/criticalHit'
import { isAttackFromDefensibleDirection, type ResolvedDefense, resolveDefense } from '../combat/defenseResolver'
import { type DefenseConfig, ITEM_CATALOG, type MeleeConfig } from '../items/itemCatalog'

/**
 * NPC-specific combat glue (plan 177) — resolves an NPC's *own* carried
 * weapon/defense item and applies the shared resolvers against it. Owns no
 * state and no decision-making; `NpcAgent` calls these from its `combat`
 * phase, `HealthState`/target-owner death consequences stay with the target.
 */

/** Melee-capable item kinds, in `ITEM_CATALOG`'s own (stable) key order —
 *  deterministic weapon pick when `resolveNpcMeleeWeapon` finds more than
 *  one carried candidate. */
const MELEE_CAPABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].melee != null)

const DEFENSE_CAPABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].defense?.canBlock)

export type NpcMeleeWeapon = { kind: ItemKind, melee: MeleeConfig }

/** Resolves the melee weapon an NPC currently carries (plan 177 §6/§11) —
 *  the first melee-capable kind found in `carried`. No fallback: an NPC with
 *  no melee-capable item cannot start combat (see `NpcAgent.beginCombat`). */
export function resolveNpcMeleeWeapon(carried: Inventory): NpcMeleeWeapon | null {
  for (const kind of MELEE_CAPABLE_KINDS) {
    if (!carried.holdsAny(kind)) continue
    const melee = ITEM_CATALOG[kind].melee
    if (melee) return { kind, melee }
  }
  return null
}

/** Resolves the first carried item that can block, if any — same
 *  "smallest existing-compatible source" as `resolveNpcMeleeWeapon`; `null`
 *  is the normal case for an NPC with nothing defensive carried. */
export function resolveNpcDefenseConfig(carried: Inventory): DefenseConfig | null {
  for (const kind of DEFENSE_CAPABLE_KINDS) {
    if (!carried.holdsAny(kind)) continue
    return ITEM_CATALOG[kind].defense ?? null
  }
  return null
}

/** One resolved melee hit — critical roll, then the target's own
 *  `applyDamage` (defense against an NPC's outgoing attack, if the target
 *  exposes it, still happens inside that call: e.g. `AnimalAgent.takeDamage`
 *  or a future NPC-target defense path). Mirrors `gameLoop.ts`'s player
 *  melee hit handling without duplicating it. */
export function applyNpcMeleeHit(
  target: CombatTargetHandle,
  config: MeleeConfig,
  attackerId: string,
  attackKey: string,
  attempt: number,
): { critical: boolean, damage: number } {
  const result = resolveCriticalHit(
    config.damage,
    MELEE_CRITICAL_CHANCE,
    MELEE_CRITICAL_MULTIPLIER,
    attackerId,
    attackKey,
    attempt,
  )
  target.applyDamage(result.damage)
  return result
}

/** Incoming damage against an NPC (plan 177 §8/§10 — `animal → NPC`,
 *  `NPC → NPC`, `player → NPC` are all the same shape) — defense first, via
 *  whatever `carried` currently exposes, then the caller applies
 *  `finalDamage` to `HealthState` itself (this stays a pure resolver, no
 *  `HealthState` import). `defenseSkillValue` defaults to `0` (no bonus) —
 *  NPCs have no `PlayerSkills`-equivalent defense progression yet; this is
 *  the smallest existing-compatible value, not a new progression system. */
export function resolveIncomingNpcDamage(params: {
  amount: number
  carried: Inventory
  defenderId: string
  defenderX: number
  defenderZ: number
  /** NPC facing yaw in `steerTo`'s convention (`atan2(dirX, dirZ)`) — this
   *  function converts it to the shared combat forward convention
   *  (`-sin`, `-cos`) internally, so callers pass `mesh.rotation.y` as-is. */
  defenderFacingYaw: number
  attackerX?: number
  attackerZ?: number
  attackerKey: string
  attempt: number
  defenseSkillValue?: number
}): ResolvedDefense {
  const defense = resolveNpcDefenseConfig(params.carried)
  const inArc = params.attackerX != null && params.attackerZ != null
    ? isAttackFromDefensibleDirection(
        params.defenderX,
        params.defenderZ,
        // `NpcAgent.mesh.rotation.y` follows `steerTo`'s facing convention
        // (forward = (sin(rot), cos(rot))), the mirror image of the shared
        // combat convention (forward = (-sin(yaw), -cos(yaw))) — rotating by
        // pi converts one into the other.
        params.defenderFacingYaw + Math.PI,
        params.attackerX,
        params.attackerZ,
      )
    : false
  return resolveDefense(
    params.amount,
    defense,
    params.defenseSkillValue ?? 0,
    params.defenderId,
    params.attackerKey,
    params.attempt,
    inArc,
  )
}
