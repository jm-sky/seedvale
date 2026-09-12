import type { Inventory } from './Inventory'
import { ITEM_DEFS } from './items'
import {
  isArmorCatalogKind,
  ITEM_CATALOG,
} from './itemCatalog'
import {
  isArmorItemInstance,
  resolveEffectiveArmorPiece,
  type EffectiveArmorPiece,
} from './armorItemInstances'
import type { ArmorItemInstance, ItemInstance } from './itemInstances'

/** Wearable-equipment slots (plan items-player-030). */
export type EquipmentSlot = 'head' | 'body' | 'arms' | 'hands' | 'legs' | 'feet'

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  'head',
  'body',
  'arms',
  'hands',
  'legs',
  'feet',
]

/** Persisted equipment selection — instance IDs only; Inventory owns the items. */
export type SavePlayerEquipment = Partial<Record<EquipmentSlot, string>>

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

/**
 * Actor-neutral wearable-equipment state (plan items-player-030).
 * Owns only which owned instance is worn per slot; Inventory remains sole owner.
 *
 * @domain items-player
 * @system equipment
 * @role Tracks which owned armor instance (if any) is worn in each equipment slot.
 * @uses Inventory
 */
export type EquipmentState = {
  /** Raw stored instance id for a slot — may be stale; prefer live-valid helpers. */
  getSlot: (slot: EquipmentSlot) => string | null
  /** Equips a concrete owned armor instance into its catalog slot. */
  equip: (instanceId: string, inventory: Inventory) => boolean
  unequip: (slot: EquipmentSlot) => void
  syncWithInventory: (inventory: Inventory) => void
  exportState: (inventory: Inventory) => SavePlayerEquipment
}

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && (EQUIPMENT_SLOTS as readonly string[]).includes(value)
}

function liveValidArmorInstance(
  instanceId: string | null | undefined,
  inventory: Inventory,
  expectedSlot?: EquipmentSlot,
): ArmorItemInstance | null {
  if (!instanceId) return null
  const instance = inventory.getInstance(instanceId)
  if (!instance || !isArmorItemInstance(instance) || !isArmorCatalogKind(instance.kind)) return null
  const slot = ITEM_CATALOG[instance.kind].armor!.slot
  if (expectedSlot != null && slot !== expectedSlot) return null
  return instance
}

/**
 * Restores from `initial` only when each saved instance id is still owned and
 * matches the slot. Invalid references resolve empty — never recreate items.
 *
 * Also accepts a legacy single `body: ItemKind` string that matches an owned
 * armor instance kind (post count→instance migration).
 */
export function createEquipmentState(inventory: Inventory, initial?: SavePlayerEquipment): EquipmentState {
  const slots: Record<EquipmentSlot, string | null> = {
    head: null,
    body: null,
    arms: null,
    hands: null,
    legs: null,
    feet: null,
  }

  if (initial) {
    for (const slot of EQUIPMENT_SLOTS) {
      const raw = initial[slot]
      if (typeof raw !== 'string' || raw.length === 0) continue
      const byId = liveValidArmorInstance(raw, inventory, slot)
      if (byId) {
        slots[slot] = byId.id
        continue
      }
      // Legacy body kind → first owned instance of that kind (migration seam).
      if (slot === 'body' && isArmorCatalogKind(raw as never)) {
        const match = inventory.getInstances(raw as never).find(
          (inst) => isArmorItemInstance(inst) && ITEM_CATALOG[inst.kind].armor?.slot === 'body',
        )
        if (match) slots.body = match.id
      }
    }
  }

  // One instance cannot occupy multiple slots.
  const seen = new Set<string>()
  for (const slot of EQUIPMENT_SLOTS) {
    const id = slots[slot]
    if (id == null) continue
    if (seen.has(id)) {
      slots[slot] = null
      continue
    }
    seen.add(id)
  }

  return {
    getSlot(slot) {
      return slots[slot]
    },
    equip(instanceId, inv) {
      const instance = liveValidArmorInstance(instanceId, inv)
      if (!instance) return false
      const slot = ITEM_CATALOG[instance.kind].armor!.slot
      for (const s of EQUIPMENT_SLOTS) {
        if (slots[s] === instance.id) slots[s] = null
      }
      slots[slot] = instance.id
      return true
    },
    unequip(slot) {
      slots[slot] = null
    },
    syncWithInventory(inv) {
      for (const slot of EQUIPMENT_SLOTS) {
        if (liveValidArmorInstance(slots[slot], inv, slot) == null) slots[slot] = null
      }
    },
    exportState(inv) {
      const out: SavePlayerEquipment = {}
      for (const slot of EQUIPMENT_SLOTS) {
        const live = liveValidArmorInstance(slots[slot], inv, slot)
        if (live) out[slot] = live.id
      }
      return out
    },
  }
}

/** Live-valid equipped armor instances across all slots (no ghosts). */
export function equippedArmorInstances(
  equipment: EquipmentState,
  inventory: Inventory,
): readonly ArmorItemInstance[] {
  const out: ArmorItemInstance[] = []
  const seen = new Set<string>()
  for (const slot of EQUIPMENT_SLOTS) {
    const live = liveValidArmorInstance(equipment.getSlot(slot), inventory, slot)
    if (!live || seen.has(live.id)) continue
    seen.add(live.id)
    out.push(live)
  }
  return out
}

/** Compatibility helper — live-valid body piece kind, or null. */
export function equippedBodyArmor(equipment: EquipmentState, inventory: Inventory): ArmorItemInstance['kind'] | null {
  const live = liveValidArmorInstance(equipment.getSlot('body'), inventory, 'body')
  return live?.kind ?? null
}

/** Live-valid equipped instance id for a slot, or null. */
export function equippedInstanceId(
  equipment: EquipmentState,
  inventory: Inventory,
  slot: EquipmentSlot,
): string | null {
  return liveValidArmorInstance(equipment.getSlot(slot), inventory, slot)?.id ?? null
}

/** Map of slot → live-valid equipped instance id (for UI). */
export function equippedInstanceIds(
  equipment: EquipmentState,
  inventory: Inventory,
): Partial<Record<EquipmentSlot, string>> {
  const out: Partial<Record<EquipmentSlot, string>> = {}
  for (const slot of EQUIPMENT_SLOTS) {
    const id = equippedInstanceId(equipment, inventory, slot)
    if (id) out[slot] = id
  }
  return out
}

/**
 * Fold effective per-piece armor into aggregate modifiers.
 * Protection multiplies remaining-damage factors; restriction multipliers multiply.
 *
 * @domain items-player
 */
export function composeEquipmentModifiers(pieces: readonly EffectiveArmorPiece[]): EquipmentModifiers {
  if (pieces.length === 0) return NEUTRAL_EQUIPMENT_MODIFIERS
  let incomingDamageMultiplier = 1
  let meleeStaminaMultiplier = 1
  let meleeRecoveryMultiplier = 1
  let movementSpeedMultiplier = 1
  let sprintStaminaMultiplier = 1
  for (const piece of pieces) {
    incomingDamageMultiplier *= 1 - piece.damageReduction
    meleeStaminaMultiplier *= piece.staminaCostMultiplier
    meleeRecoveryMultiplier *= piece.meleeRecoveryMultiplier
    movementSpeedMultiplier *= piece.movementSpeedMultiplier
    sprintStaminaMultiplier *= piece.sprintStaminaMultiplier
  }
  return {
    incomingDamageMultiplier,
    meleeStaminaMultiplier,
    meleeRecoveryMultiplier,
    movementSpeedMultiplier,
    sprintStaminaMultiplier,
  }
}

function effectivePieceForInstance(instance: ArmorItemInstance): EffectiveArmorPiece | null {
  const armor = ITEM_CATALOG[instance.kind].armor
  if (!armor) return null
  return resolveEffectiveArmorPiece(armor, instance.quality, ITEM_DEFS[instance.kind].weight)
}

/**
 * Single derivation point for wearable-equipment gameplay effects.
 *
 * @domain items-player
 */
export function resolveEquipmentModifiers(equipment: EquipmentState, inventory: Inventory): EquipmentModifiers {
  const pieces: EffectiveArmorPiece[] = []
  for (const instance of equippedArmorInstances(equipment, inventory)) {
    const piece = effectivePieceForInstance(instance)
    if (piece) pieces.push(piece)
  }
  return composeEquipmentModifiers(pieces)
}

/** Effective display stats for one armor instance (UI + gameplay share this). */
export function resolveArmorInstanceEffective(instance: ItemInstance): EffectiveArmorPiece | null {
  if (!isArmorItemInstance(instance)) return null
  return effectivePieceForInstance(instance)
}
