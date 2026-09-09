import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { isMeleeToolKind, isRangedTool } from './itemCatalog'
import { isInstanceBackedKind, isWeaponMaintenanceKind } from './itemInstances'

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

/** Kind-level ownership for primary-weapon slots. Instance-backed weapons
 *  live in `Inventory.instances` (`countInstances`); stack weapons still
 *  use `has()`. Does not require a specific instance — `syncChoice` relies
 *  on that so a removed instance can re-resolve onto another of the same
 *  kind. */
export function inventoryOwnsPrimaryWeaponKind(inventory: Inventory, kind: ItemKind): boolean {
  return isInstanceBackedKind(kind)
    ? inventory.countInstances(kind) > 0
    : inventory.has(kind, 1)
}

/** Assignment-time ownership. A concrete `instanceId` must exist in
 *  inventory and match `kind`; `null` falls back to kind-level ownership
 *  (stack weapons, or instance-backed kinds when the UI did not name one). */
export function inventoryOwnsPrimaryWeaponChoice(
  inventory: Inventory,
  kind: ItemKind,
  instanceId: string | null,
): boolean {
  if (instanceId != null) {
    const instance = inventory.getInstance(instanceId)
    return instance !== null && instance.kind === kind
  }
  return inventoryOwnsPrimaryWeaponKind(inventory, kind)
}

function syncChoice(inventory: Inventory, choice: PrimaryWeaponChoice | null): PrimaryWeaponChoice | null {
  if (!choice) return null
  if (!inventoryOwnsPrimaryWeaponKind(inventory, choice.kind)) return null
  return { kind: choice.kind, instanceId: resolveInstanceId(inventory, choice.kind, choice.instanceId) }
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

export function isPrimaryMeleeAssignment(kind: ItemKind, instanceId: string | null, choice: PrimaryWeaponChoice | null): boolean {
  if (!choice || choice.kind !== kind) return false
  if (!isWeaponMaintenanceKind(kind)) return true
  return choice.instanceId === instanceId
}

export function isPrimaryRangedAssignment(kind: ItemKind, instanceId: string | null, choice: PrimaryWeaponChoice | null): boolean {
  if (!choice || choice.kind !== kind) return false
  if (!isWeaponMaintenanceKind(kind)) return true
  return choice.instanceId === instanceId
}
