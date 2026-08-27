import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { isMeleeToolKind, isRangedTool } from './itemCatalog'
import { isWeaponMaintenanceKind } from './itemInstances'

export type PrimaryWeaponChoice = { kind: ItemKind, instanceId: string | null }

/** Remembers "the melee weapon" / "the ranged weapon" the player last
 *  equipped, so a HUD shortcut can re-equip either with one click without a
 *  separate favorite-picker UI (plan `ui-input-002` §6). Session-local only —
 *  not part of `SaveData`; re-populates itself the first time the player
 *  equips a melee/ranged weapon in a session, same as before this feature
 *  existed except for the shortcut. Not a second equipment model: both
 *  choices resolve through the same `HeldTool.equip()` and are re-validated
 *  against `Inventory`, mirroring `HeldTool.syncWithInventory`'s contract. */
export type PrimaryWeaponSelection = {
  primaryMelee: () => PrimaryWeaponChoice | null
  primaryRanged: () => PrimaryWeaponChoice | null
  /** Call after any successful `HeldTool.equip()` — updates the remembered
   *  choice when the equipped kind is melee/ranged, no-ops otherwise. */
  noteEquipped: (kind: ItemKind, instanceId: string | null) => void
  /** Drops a choice whose kind is no longer in inventory, and re-resolves its
   *  instance id (weapon-maintenance kinds) the same way `HeldTool` does —
   *  call alongside `heldTool.syncWithInventory()`. */
  syncWithInventory: (inventory: Inventory) => void
}

function resolveInstanceId(inventory: Inventory, kind: ItemKind, preferId: string | null): string | null {
  if (!isWeaponMaintenanceKind(kind)) return null
  const instances = inventory.getInstances(kind)
  if (instances.length === 0) return null
  if (preferId && instances.some((inst) => inst.id === preferId)) return preferId
  return instances[0]!.id
}

export function createPrimaryWeaponSelection(): PrimaryWeaponSelection {
  let melee: PrimaryWeaponChoice | null = null
  let ranged: PrimaryWeaponChoice | null = null

  return {
    primaryMelee: () => melee,
    primaryRanged: () => ranged,
    noteEquipped(kind, instanceId) {
      if (isMeleeToolKind(kind)) melee = { kind, instanceId }
      else if (isRangedTool(kind)) ranged = { kind, instanceId }
    },
    syncWithInventory(inventory) {
      if (melee) melee = inventory.has(melee.kind, 1) ? { kind: melee.kind, instanceId: resolveInstanceId(inventory, melee.kind, melee.instanceId) } : null
      if (ranged) ranged = inventory.has(ranged.kind, 1) ? { kind: ranged.kind, instanceId: resolveInstanceId(inventory, ranged.kind, ranged.instanceId) } : null
    },
  }
}
