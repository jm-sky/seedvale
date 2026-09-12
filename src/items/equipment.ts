import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { isBodyArmorKind, ITEM_CATALOG } from './itemCatalog'

/** Wearable-equipment slot (plan items-player-029). Only `body` exists today;
 *  the type is a union (not hard-coded to one literal) so a future slot
 *  (head/offHand/hands/legs) extends it without changing ownership semantics. */
export type EquipmentSlot = 'body'

/** Persisted equipment selection — identity only, never a copy of item data
 *  already owned by `Inventory` (plan items-player-029 §11). */
export type SavePlayerEquipment = {
  body?: ItemKind
}

/** Derived gameplay effect of whatever is currently (validly) worn — the
 *  single shape every consumer (damage/melee/movement) reads. Neutral (`1`)
 *  means "no effect", so an unarmored player composes as a no-op everywhere
 *  this is used. */
export type EquipmentModifiers = {
  /** Multiplier on remaining incoming combat/physical damage, applied after
   *  active held-item defense (`combat/defenseResolver.ts`). */
  incomingDamageMultiplier: number
  meleeStaminaMultiplier: number
  meleeRecoveryMultiplier: number
  movementSpeedMultiplier: number
  sprintStaminaMultiplier: number
}

export const NEUTRAL_EQUIPMENT_MODIFIERS: EquipmentModifiers = {
  incomingDamageMultiplier: 1,
  meleeStaminaMultiplier: 1,
  meleeRecoveryMultiplier: 1,
  movementSpeedMultiplier: 1,
  sprintStaminaMultiplier: 1,
}

/** Actor-neutral wearable-equipment state (plan items-player-029) — player-only
 *  in this plan's scope, but the type itself doesn't encode `Player`. Owns only
 *  *which* owned item is worn; `Inventory` remains the sole item owner. Never
 *  trust `body()` directly outside this module for gameplay effects or
 *  presentation — use `equippedBodyArmor()`/`resolveEquipmentModifiers()`,
 *  which re-validate ownership+catalog metadata live so a sold/dropped/traded
 *  item can never leave a ghost bonus, whether or not `syncWithInventory()`
 *  happened to run since the item left the bag.
 *
 * @domain items-player
 * @system equipment
 * @role Tracks which owned item (if any) is currently worn in each equipment slot.
 * @uses Inventory
 */
export type EquipmentState = {
  /** Raw stored selection — may be stale (sold/dropped/traded away since);
   *  see the module doc above for why callers should prefer
   *  `equippedBodyArmor()` instead of trusting this directly. */
  body: () => ItemKind | null
  /** Equips `kind` into `body` if `inventory` currently owns it and it
   *  declares `armor.slot === 'body'`. Returns false (no-op) otherwise. */
  equip: (kind: ItemKind, inventory: Inventory) => boolean
  unequip: (slot: EquipmentSlot) => void
  /** Clears `body` if the stored kind is no longer owned by `inventory` — an
   *  explicit hygiene pass (keeps the raw selection itself honest), not a
   *  safety requirement: `equippedBodyArmor()`/`resolveEquipmentModifiers()`
   *  already re-check ownership on every call regardless. */
  syncWithInventory: (inventory: Inventory) => void
  /** Persisted snapshot — only the still-owned, still-valid selection ever
   *  round-trips; a stale reference silently exports as empty rather than
   *  writing a ghost kind into the save. */
  exportState: (inventory: Inventory) => SavePlayerEquipment
}

/** Restores from `initial` only when the saved kind still declares body-armor
 *  metadata and is actually owned by `inventory` (plan items-player-029 §11) —
 *  an invalid/missing/old-save reference resolves to empty, never recreates
 *  the item. */
export function createEquipmentState(inventory: Inventory, initial?: SavePlayerEquipment): EquipmentState {
  let bodyKind: ItemKind | null = null
  if (initial?.body != null && isBodyArmorKind(initial.body) && inventory.has(initial.body, 1)) {
    bodyKind = initial.body
  }

  return {
    body: () => bodyKind,
    equip(kind, inv) {
      if (!isBodyArmorKind(kind) || !inv.has(kind, 1)) return false
      bodyKind = kind
      return true
    },
    unequip(slot) {
      if (slot === 'body') bodyKind = null
    },
    syncWithInventory(inv) {
      if (bodyKind !== null && !inv.has(bodyKind, 1)) bodyKind = null
    },
    exportState(inv) {
      return bodyKind !== null && inv.has(bodyKind, 1) ? { body: bodyKind } : {}
    },
  }
}

/** The live-valid equipped body armor — `null` when nothing is selected, the
 *  selection is no longer owned, or the owned kind no longer declares
 *  body-armor metadata. Centralizes the "no ghost equipment" invariant (plan
 *  items-player-029 §2) so every consumer (resolver, UI, save export) agrees
 *  on the same answer without each one remembering to call
 *  `EquipmentState.syncWithInventory()` first. */
export function equippedBodyArmor(equipment: EquipmentState, inventory: Inventory): ItemKind | null {
  const kind = equipment.body()
  if (kind === null || !isBodyArmorKind(kind) || !inventory.has(kind, 1)) return null
  return kind
}

/** The one pure derivation point for every wearable-equipment gameplay effect
 *  (plan items-player-029 §4) — damage/melee/movement code reads this instead
 *  of branching on equipped item kind directly. Returns
 *  `NEUTRAL_EQUIPMENT_MODIFIERS` whenever nothing valid is worn. */
export function resolveEquipmentModifiers(equipment: EquipmentState, inventory: Inventory): EquipmentModifiers {
  const kind = equippedBodyArmor(equipment, inventory)
  if (kind === null) return NEUTRAL_EQUIPMENT_MODIFIERS
  const armor = ITEM_CATALOG[kind].armor!
  return {
    incomingDamageMultiplier: 1 - armor.damageReduction,
    meleeStaminaMultiplier: armor.staminaCostMultiplier ?? 1,
    meleeRecoveryMultiplier: armor.meleeRecoveryMultiplier ?? 1,
    movementSpeedMultiplier: armor.movementSpeedMultiplier ?? 1,
    sprintStaminaMultiplier: armor.sprintStaminaMultiplier ?? 1,
  }
}
