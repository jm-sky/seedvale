import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { isMeleeToolKind, isRangedTool } from './itemCatalog'
import { isWeaponMaintenanceKind } from './itemInstances'

export type PrimaryWeaponChoice = { kind: ItemKind, instanceId: string | null }

export type SavePrimaryWeaponChoice = PrimaryWeaponChoice

/** Explicit primary melee/ranged weapon slots configured from Inventory and
 *  restored from save. Both choices resolve through the same `HeldTool.equip()`
 *  path and are re-validated against `Inventory` via `syncWithInventory()`. */
export type PrimaryWeaponSelection = {
  primaryMelee: () => PrimaryWeaponChoice | null
  primaryRanged: () => PrimaryWeaponChoice | null
  setPrimaryMelee: (choice: PrimaryWeaponChoice) => void
  setPrimaryRanged: (choice: PrimaryWeaponChoice) => void
  /** Call after any successful ordinary `HeldTool.equip()` — populates an
   *  empty melee/ranged slot only; never overwrites an explicit assignment. */
  noteEquipped: (kind: ItemKind, instanceId: string | null) => void
  /** Drops a choice whose kind is no longer in inventory, and re-resolves its
   *  instance id (weapon-maintenance kinds) the same way `HeldTool` does. */
  syncWithInventory: (inventory: Inventory) => void
  exportState: () => { primaryMeleeWeapon: SavePrimaryWeaponChoice | null, primaryRangedWeapon: SavePrimaryWeaponChoice | null }
  restoreState: (saved: { primaryMeleeWeapon?: SavePrimaryWeaponChoice | null, primaryRangedWeapon?: SavePrimaryWeaponChoice | null }) => void
}

function resolveInstanceId(inventory: Inventory, kind: ItemKind, preferId: string | null): string | null {
  if (!isWeaponMaintenanceKind(kind)) return null
  const instances = inventory.getInstances(kind)
  if (instances.length === 0) return null
  if (preferId && instances.some((inst) => inst.id === preferId)) return preferId
  return instances[0]!.id
}

function syncChoice(inventory: Inventory, choice: PrimaryWeaponChoice | null): PrimaryWeaponChoice | null {
  if (!choice) return null
  return inventory.has(choice.kind, 1)
    ? { kind: choice.kind, instanceId: resolveInstanceId(inventory, choice.kind, choice.instanceId) }
    : null
}

export function createPrimaryWeaponSelection(): PrimaryWeaponSelection {
  let melee: PrimaryWeaponChoice | null = null
  let ranged: PrimaryWeaponChoice | null = null

  return {
    primaryMelee: () => melee,
    primaryRanged: () => ranged,
    setPrimaryMelee(choice) { melee = choice },
    setPrimaryRanged(choice) { ranged = choice },
    noteEquipped(kind, instanceId) {
      if (isMeleeToolKind(kind) && !melee) melee = { kind, instanceId }
      else if (isRangedTool(kind) && !ranged) ranged = { kind, instanceId }
    },
    syncWithInventory(inventory) {
      melee = syncChoice(inventory, melee)
      ranged = syncChoice(inventory, ranged)
    },
    exportState: () => ({
      primaryMeleeWeapon: melee ? { ...melee } : null,
      primaryRangedWeapon: ranged ? { ...ranged } : null,
    }),
    restoreState(saved) {
      melee = saved.primaryMeleeWeapon ?? null
      ranged = saved.primaryRangedWeapon ?? null
    },
  }
}

export function isPrimaryMeleeAssignment(kind: ItemKind, choice: PrimaryWeaponChoice | null): boolean {
  if (!choice || choice.kind !== kind) return false
  if (!isWeaponMaintenanceKind(kind)) return true
  return choice.instanceId != null
}

export function isPrimaryRangedAssignment(kind: ItemKind, instanceId: string | null, choice: PrimaryWeaponChoice | null): boolean {
  if (!choice || choice.kind !== kind) return false
  if (!isWeaponMaintenanceKind(kind)) return true
  return choice.instanceId === instanceId
}
