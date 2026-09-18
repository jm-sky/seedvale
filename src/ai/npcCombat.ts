import type { CombatTargetHandle } from '../combat/combatIntent'
import type { Projectile } from '../combat/projectile'
import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { Role } from './characters'
import { MELEE_CRITICAL_CHANCE, MELEE_CRITICAL_MULTIPLIER, resolveCriticalHit } from '../combat/criticalHit'
import { isAttackFromDefensibleDirection, type ResolvedDefense, resolveDefense } from '../combat/defenseResolver'
import { applyMeleeStrength } from '../combat/meleeStrength'
import { ARMOR_KIND_LIST, type ArmorItemInstance, isArmorItemInstance } from '../items/armorItemInstances'
import {
  createEquipmentState,
  EQUIPMENT_SLOTS,
  type EquipmentSlot,
  type EquipmentState,
  resolveArmorInstanceEffective,
  resolveEquipmentModifiers,
} from '../items/equipment'
import { type DefenseConfig, ITEM_CATALOG, type MeleeConfig, type RangedConfig } from '../items/itemCatalog'

/**
 * NPC-specific combat glue (plan 177, extended by plan npc-053) — resolves an
 * NPC's *own* carried weapon/defense item and worn armor from
 * `personalInventory`, and applies the shared resolvers against them. Owns
 * no state and no decision-making; `NpcAgent` calls these from its `combat`
 * phase, `HealthState`/target-owner death consequences stay with the target.
 */

/** Melee-capable item kinds — discovery order only; final weapon selection
 *  always goes through `pickBestCandidate`'s explicit score + lexical
 *  tie-break (plan npc-053 §8), never this array's order. */
const MELEE_CAPABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].melee != null)

const DEFENSE_CAPABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].defense?.canBlock)

/** Ranged-capable item kinds (bows) — same discovery-only role as
 *  `MELEE_CAPABLE_KINDS` (plan 177 §7 / plan npc-053). */
const RANGED_CAPABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].ranged != null)

export type NpcMeleeWeapon = { kind: ItemKind, melee: MeleeConfig }
export type NpcRangedWeapon = { kind: ItemKind, ranged: RangedConfig }

/** Small pure weapon-family classification (plan npc-053 §4) — used only for
 *  NPC profession weapon preference, not a general item-catalog concept. */
export type NpcMeleeWeaponFamily = 'compact' | 'sword' | 'axe' | 'spear' | 'tool'
export type NpcRangedWeaponFamily = 'bow'

/** Explicit per-kind family classification for every current melee-capable
 *  `ItemKind` (plan npc-053 §4/§9 implementation notes) — deliberately total
 *  over today's catalog so a future melee-capable addition that's missing
 *  here fails `npcCombat.test.ts`'s completeness test instead of silently
 *  becoming `tool`. */
const NPC_MELEE_WEAPON_FAMILY: Readonly<Partial<Record<ItemKind, NpcMeleeWeaponFamily>>> = {
  knife: 'compact',
  dagger: 'compact',
  damascus_knife: 'compact',
  short_sword: 'sword',
  long_sword: 'sword',
  damascus_short_sword: 'sword',
  damascus_long_sword: 'sword',
  masterwork_sword: 'sword',
  obsidian_sword: 'sword',
  hatchet: 'axe',
  axe: 'axe',
  battle_axe: 'axe',
  spear: 'spear',
  pitchfork: 'spear',
  sickle: 'tool',
  shovel: 'tool',
  shears: 'tool',
}

/** Classifies a melee-capable `ItemKind` into its NPC weapon family — falls
 *  back to `tool` for anything not explicitly listed in
 *  `NPC_MELEE_WEAPON_FAMILY` (plan npc-053 §4: "unclassified melee-capable
 *  kind falls into tool, rather than becoming unusable"). */
export function npcMeleeWeaponFamily(kind: ItemKind): NpcMeleeWeaponFamily {
  return NPC_MELEE_WEAPON_FAMILY[kind] ?? 'tool'
}

/** All current ranged weapons are bows (plan npc-053 §4) — kept as a
 *  function so a future second ranged family only needs a new lookup here,
 *  not a signature change. */
export function npcRangedWeaponFamily(_kind: ItemKind): NpcRangedWeaponFamily {
  return 'bow'
}

/** Closed per-role preferred melee family/families (plan npc-053 §5) —
 *  `Record<Role, ...>` over every current `Role` so a new one forces an
 *  explicit choice here rather than silently defaulting. */
const NPC_MELEE_FAMILY_PREFERENCE: Readonly<Record<Role, readonly NpcMeleeWeaponFamily[]>> = {
  guard: ['sword'],
  trader: ['compact'],
  hunter: ['compact'],
  woodcutter: ['axe'],
  farmer: ['spear', 'tool'],
  blacksmith: ['axe', 'sword'],
  miner: ['compact', 'axe'],
  fisher: ['compact', 'spear'],
  shepherd: ['spear'],
  textile_worker: ['compact'],
  herbalist: ['compact'],
}

/** Only `hunter` has a ranged preference in V1 (plan npc-053 §5) — every
 *  other role has no entry, which is equivalent to "no bonus" since there's
 *  only one ranged family today. */
const NPC_RANGED_FAMILY_PREFERENCE: Readonly<Partial<Record<Role, readonly NpcRangedWeaponFamily[]>>> = {
  hunter: ['bow'],
}

/** Profession-preferred-family bonus (plan npc-053 §7) — a weapon outside
 *  the preferred family must beat this multiplier on raw `baseScore` to win. */
const PROFESSION_FAMILY_BONUS_MULTIPLIER = 1.5

function meleeCombatScore(config: MeleeConfig): number {
  const attackCycle = config.windUp + config.hitWindow + config.recovery
  return attackCycle > 0 ? config.damage / attackCycle : 0
}

function rangedCombatScore(config: RangedConfig): number {
  const attackCycle = config.drawTime + config.recovery
  return attackCycle > 0 ? config.damage / attackCycle : 0
}

type ScoredCandidate = { kind: ItemKind, baseScore: number, effectiveScore: number }

/** Deterministic best-candidate reduction (plan npc-053 §8) — compares every
 *  pair explicitly (higher `effectiveScore`, then higher `baseScore`, then
 *  lexical `ItemKind`), so the result never depends on iteration/catalog
 *  order, only on the candidate set itself. */
function pickBestCandidate<T extends ScoredCandidate>(candidates: readonly T[]): T | null {
  let best: T | null = null
  for (const candidate of candidates) {
    if (
      best == null
      || candidate.effectiveScore > best.effectiveScore
      || (candidate.effectiveScore === best.effectiveScore && candidate.baseScore > best.baseScore)
      || (candidate.effectiveScore === best.effectiveScore && candidate.baseScore === best.baseScore && candidate.kind < best.kind)
    ) {
      best = candidate
    }
  }
  return best
}

/** Resolves the best melee weapon an NPC currently owns (plan npc-053 §3/§6/
 *  §7/§8) — scores every melee-capable kind actually held in
 *  `personalInventory` by `damage / (windUp + hitWindow + recovery)`, applies
 *  the profession preferred-family `×1.5` bonus, then picks deterministically.
 *  No fallback: an NPC with no melee-capable item cannot start combat (see
 *  `NpcAgent.beginCombat`). */
export function resolveNpcMeleeWeapon(inventory: Inventory, role: Role): NpcMeleeWeapon | null {
  const preferred = NPC_MELEE_FAMILY_PREFERENCE[role]
  const candidates: Array<ScoredCandidate & { melee: MeleeConfig }> = []
  for (const kind of MELEE_CAPABLE_KINDS) {
    if (!inventory.holdsAny(kind)) continue
    const melee = ITEM_CATALOG[kind].melee
    if (!melee) continue
    const baseScore = meleeCombatScore(melee)
    const isPreferred = preferred.includes(npcMeleeWeaponFamily(kind))
    candidates.push({
      kind,
      melee,
      baseScore,
      effectiveScore: isPreferred ? baseScore * PROFESSION_FAMILY_BONUS_MULTIPLIER : baseScore,
    })
  }
  const best = pickBestCandidate(candidates)
  return best ? { kind: best.kind, melee: best.melee } : null
}

/** Resolves the best bow an NPC currently owns (plan npc-053 §5/§6/§7/§8/
 *  §11) — mirrors `resolveNpcMeleeWeapon` for the ranged mode. Does **not**
 *  check ammo: a bow with no compatible arrow currently carried still
 *  resolves here (matches every melee-capable weapon's "config exists"
 *  contract); `NpcAgent.beginCombat`/the `combat` phase separately require
 *  actual ammo before drawing. */
export function resolveNpcRangedWeapon(inventory: Inventory, role: Role): NpcRangedWeapon | null {
  const preferred = NPC_RANGED_FAMILY_PREFERENCE[role] ?? []
  const candidates: Array<ScoredCandidate & { ranged: RangedConfig }> = []
  for (const kind of RANGED_CAPABLE_KINDS) {
    if (!inventory.holdsAny(kind)) continue
    const ranged = ITEM_CATALOG[kind].ranged
    if (!ranged) continue
    const baseScore = rangedCombatScore(ranged)
    const isPreferred = preferred.includes(npcRangedWeaponFamily(kind))
    candidates.push({
      kind,
      ranged,
      baseScore,
      effectiveScore: isPreferred ? baseScore * PROFESSION_FAMILY_BONUS_MULTIPLIER : baseScore,
    })
  }
  const best = pickBestCandidate(candidates)
  return best ? { kind: best.kind, ranged: best.ranged } : null
}

/** One resolved ammo unit and the inventory that actually owns it — firing
 *  must `remove` from this inventory only (plan items-player-027). */
export type NpcAmmoSource = { kind: ItemKind, inventory: Inventory }

/** Resolves compatible ammo across one or more inventories in caller order.
 *  First matching `(ammoKind, inventory)` wins — used so personal belongings
 *  and transient `carried` work supply can both feed ranged combat without
 *  copying ownership between them (plan items-player-027). */
export function resolveNpcAmmo(
  inventories: readonly Inventory[],
  ranged: RangedConfig,
): NpcAmmoSource | null {
  for (const kind of ranged.ammoKinds) {
    for (const inventory of inventories) {
      if (inventory.has(kind, 1)) return { kind, inventory }
    }
  }
  return null
}

/** Whether a single inventory currently holds at least one unit of any ammo
 *  kind `ranged.ammoKinds` accepts — convenience wrapper over
 *  `resolveNpcAmmo` for call sites that still pass one bag. */
export function resolveNpcAmmoKind(carried: Inventory, ranged: RangedConfig): ItemKind | null {
  return resolveNpcAmmo([carried], ranged)?.kind ?? null
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

/** One resolved melee hit — the shared Strength contribution (plan npc-019
 *  §10, same `combat/meleeStrength.ts` rule `gameLoop.ts` applies for the
 *  player), then critical roll, then the target's own `applyDamage`
 *  (defense against an NPC's outgoing attack, if the target exposes it,
 *  still happens inside that call: e.g. `AnimalAgent.takeDamage` or a future
 *  NPC-target defense path). Mirrors `gameLoop.ts`'s player melee hit
 *  handling without duplicating it. `strength` is the attacker's already-
 *  resolved/profiled Strength (`npcPhysicalProfile.ts`'s
 *  `resolveHumanStrengthProfile()`), not a raw base SPEA value. */
export function applyNpcMeleeHit(
  target: CombatTargetHandle,
  config: MeleeConfig,
  strength: number,
  attackerId: string,
  attackKey: string,
  attempt: number,
): { critical: boolean, damage: number } {
  const result = resolveCriticalHit(
    applyMeleeStrength(config.damage, strength),
    MELEE_CRITICAL_CHANCE,
    MELEE_CRITICAL_MULTIPLIER,
    attackerId,
    attackKey,
    attempt,
  )
  target.applyDamage(result.damage)
  return result
}

/** One resolved ranged hit — same critical-roll/`applyDamage` shape as
 *  `applyNpcMeleeHit`, reading damage/critical parameters off the already-
 *  spawned `Projectile` (`combat/projectile.ts`) instead of a fresh
 *  `MeleeConfig`, since that's where `gameLoop.ts`'s own player-fired
 *  projectile resolution already reads them from. */
export function applyNpcRangedHit(
  target: CombatTargetHandle,
  projectile: Projectile,
): { critical: boolean, damage: number } {
  const result = resolveCriticalHit(
    projectile.damage,
    projectile.criticalChance,
    projectile.criticalMultiplier,
    projectile.sourceId,
    projectile.attackKey,
    projectile.attempt,
  )
  target.applyDamage(result.damage)
  return result
}

/** Picks the best owned armor instance for one slot by effective
 *  `damageReduction` (plan npc-053 §13) — tie-break by `ItemKind` then
 *  instance id, mirroring `pickBestCandidate`'s determinism without forcing
 *  armor into the same generic shape (armor has no separate base/effective
 *  score split). */
function pickBestArmorInstance(instances: readonly ArmorItemInstance[]): ArmorItemInstance | null {
  let best: ArmorItemInstance | null = null
  let bestReduction = -Infinity
  for (const instance of instances) {
    const piece = resolveArmorInstanceEffective(instance)
    if (!piece) continue
    if (
      best == null
      || piece.damageReduction > bestReduction
      || (piece.damageReduction === bestReduction && instance.kind < best.kind)
      || (piece.damageReduction === bestReduction && instance.kind === best.kind && instance.id < best.id)
    ) {
      best = instance
      bestReduction = piece.damageReduction
    }
  }
  return best
}

/** Derives the best-per-slot worn armor straight from owned armor instances
 *  (plan npc-053 §12/§13) — no persistent NPC `EquipmentState`: this is
 *  rebuilt from `personalInventory` on demand (see `resolveIncomingNpcDamage`
 *  below), so a transferred/removed instance stops mitigating on the very
 *  next hit without any invalidation cache. Reuses `createEquipmentState()`
 *  for its existing slot/catalog/ownership validation instead of inventing a
 *  partial fake `EquipmentState`. */
export function resolveNpcArmorEquipment(inventory: Inventory): EquipmentState {
  const derived: Partial<Record<EquipmentSlot, string>> = {}
  for (const slot of EQUIPMENT_SLOTS) {
    const candidates: ArmorItemInstance[] = []
    for (const kind of ARMOR_KIND_LIST) {
      if (ITEM_CATALOG[kind].armor?.slot !== slot) continue
      for (const instance of inventory.getInstances(kind)) {
        if (isArmorItemInstance(instance)) candidates.push(instance)
      }
    }
    const best = pickBestArmorInstance(candidates)
    if (best) derived[slot] = best.id
  }
  return createEquipmentState(inventory, derived)
}

/** Incoming damage against an NPC (plan 177 §8/§10 — `animal → NPC`,
 *  `NPC → NPC`, `player → NPC` are all the same shape) — active defense
 *  first via whatever `carried` currently exposes, then derived worn armor
 *  (plan npc-053 §14, same shared `resolveEquipmentModifiers()` the player
 *  uses) scales whatever damage remains; the caller applies `finalDamage` to
 *  `HealthState` itself (this stays a pure resolver, no `HealthState`
 *  import). `defenseSkillValue` defaults to `0` (no bonus) — NPCs have no
 *  `PlayerSkills`-equivalent defense progression yet; this is the smallest
 *  existing-compatible value, not a new progression system. */
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
  const resolved = resolveDefense(
    params.amount,
    defense,
    params.defenseSkillValue ?? 0,
    params.defenderId,
    params.attackerKey,
    params.attempt,
    inArc,
  )
  if (resolved.finalDamage <= 0) return resolved
  const armorModifiers = resolveEquipmentModifiers(resolveNpcArmorEquipment(params.carried), params.carried)
  if (armorModifiers.incomingDamageMultiplier === 1) return resolved
  return { ...resolved, finalDamage: resolved.finalDamage * armorModifiers.incomingDamageMultiplier }
}
