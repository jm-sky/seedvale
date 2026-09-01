import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { Role } from './characters'
import { isWeaponMaintenanceKind } from '../items/itemInstances'
import { createWeaponInstance } from '../items/weaponMaintenance'

/**
 * Role-based default carried weapon (plan 185) — one central role → `ItemKind`
 * mapping instead of scattered `if (role === ...) addAxe()` branches. Every
 * role gets at least `knife` (animal-threat diagnostics task — a role with
 * `canFight === false` cannot `defend` against `decideAnimalThreatResponse`,
 * see `npcAnimalThreat.ts`): a role with an explicit entry here keeps its own
 * weapon, and `defaultWeaponForRole`'s `?? 'knife'` fallback below covers
 * every other role, including a future/unknown one not yet listed here.
 */
const DEFAULT_WEAPON_BY_ROLE: Partial<Record<Role, ItemKind>> = {
  woodcutter: 'axe',
  guard: 'long_sword',
  hunter: 'hunting_bow',
}

export function defaultWeaponForRole(role: Role): ItemKind {
  return DEFAULT_WEAPON_BY_ROLE[role] ?? 'knife'
}

/** Seeds `carried` with `role`'s default weapon, once, at NPC construction
 *  (plan 185 §6/§12) — a no-op when `carried` already holds one (defensive
 *  idempotency; construction only ever runs this once). Weapon kinds here are
 *  all `WEAPON_MAINTENANCE_KINDS` today, so this mirrors `createApp.ts`'s
 *  `grantStartingLoadout` instance-vs-count branch rather than assuming
 *  `Inventory.add()` alone is enough. */
export function seedDefaultRoleWeapon(carried: Inventory, role: Role): void {
  const kind = defaultWeaponForRole(role)
  if (carried.holdsAny(kind)) return
  if (isWeaponMaintenanceKind(kind)) {
    carried.addInstance(createWeaponInstance(kind))
  } else {
    carried.add(kind, 1)
  }
}

/** Ensures `carried` holds at least one `knife`, once — shared secondary-item
 *  step for a role whose primary weapon (`hunting_bow`, `axe`) doesn't itself
 *  cover the general-utility role a knife plays (e.g. `meat_harvesting`);
 *  same idempotency contract as `seedDefaultRoleWeapon`. */
export function ensureKnifeCarried(carried: Inventory): void {
  if (!carried.holdsAny('knife')) carried.addInstance(createWeaponInstance('knife'))
}

/** Starting ammo a fresh `hunter` carries alongside `hunting_bow` (plan 178
 *  §2) — enough for one expedition without an immediate household resupply.
 *  `HUNT_RESUPPLY_ARROW_TARGET` in `NpcAgent.ts` tops this back up from the
 *  household's own arrow stock (produced via `beginArrowCrafting`) once low. */
const HUNTER_STARTING_ARROWS = 6

/** Seeds `hunter`'s starting knife (needed for `meat_harvesting`, plan 178 §2)
 *  and a small arrow stock, once, at construction — same idempotency contract
 *  as `seedDefaultRoleWeapon` (a no-op once already carried). A separate step
 *  from `seedDefaultRoleWeapon` since a hunter carries *two* starting items
 *  (a ranged weapon and a harvesting tool), not one. */
export function seedHunterSupplies(carried: Inventory): void {
  ensureKnifeCarried(carried)
  if (carried.count('arrow') === 0) carried.add('arrow', HUNTER_STARTING_ARROWS)
}
