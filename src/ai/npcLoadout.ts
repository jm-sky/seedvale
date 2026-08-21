import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { Role } from './characters'
import { isWeaponMaintenanceKind } from '../items/itemInstances'
import { createWeaponInstance } from '../items/weaponMaintenance'

/**
 * Role-based default carried weapon (plan 185) — one central role → `ItemKind`
 * mapping instead of scattered `if (role === ...) addAxe()` branches.
 * Deliberately smaller than "every role gets a weapon": a role with no
 * appropriate existing melee item stays unarmed rather than inventing one
 * (`trader`/`miner`/`fisher` — `pickaxe` has no melee config, and the
 * merchant/fisher have no existing combat-role justification).
 */
const DEFAULT_WEAPON_BY_ROLE: Partial<Record<Role, ItemKind>> = {
  woodcutter: 'axe',
  guard: 'long_sword',
  farmer: 'knife',
}

export function defaultWeaponForRole(role: Role): ItemKind | null {
  return DEFAULT_WEAPON_BY_ROLE[role] ?? null
}

/** Seeds `carried` with `role`'s default weapon, once, at NPC construction
 *  (plan 185 §6/§12) — a no-op when the role has no default or `carried`
 *  already holds one (defensive idempotency; construction only ever runs
 *  this once). Weapon kinds here are all `WEAPON_MAINTENANCE_KINDS` today,
 *  so this mirrors `createApp.ts`'s `grantStartingLoadout` instance-vs-count
 *  branch rather than assuming `Inventory.add()` alone is enough. */
export function seedDefaultRoleWeapon(carried: Inventory, role: Role): void {
  const kind = defaultWeaponForRole(role)
  if (!kind || carried.holdsAny(kind)) return
  if (isWeaponMaintenanceKind(kind)) {
    carried.addInstance(createWeaponInstance(kind))
  } else {
    carried.add(kind, 1)
  }
}
