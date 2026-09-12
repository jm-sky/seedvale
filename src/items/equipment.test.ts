import { describe, expect, it } from 'vitest'
import {
  createArmorInstance,
  resolveEffectiveArmorPiece,
} from './armorItemInstances'
import {
  composeEquipmentModifiers,
  createEquipmentState,
  equippedBodyArmor,
  equippedInstanceId,
  NEUTRAL_EQUIPMENT_MODIFIERS,
  resolveEquipmentModifiers,
} from './equipment'
import { Inventory } from './Inventory'
import { ITEM_CATALOG } from './itemCatalog'
import { ITEM_DEFS } from './items'

function inventoryWithArmor(
  ...pieces: { kind: 'leather_armor' | 'chainmail', quality?: 'common' | 'good' | 'masterwork' }[]
): { inventory: Inventory, ids: string[] } {
  const inventory = new Inventory({})
  const ids: string[] = []
  for (const piece of pieces) {
    const inst = createArmorInstance(piece.kind, piece.quality ?? 'common')
    expect(inventory.addInstance(inst)).toBe(true)
    ids.push(inst.id)
  }
  return { inventory, ids }
}

describe('createEquipmentState', () => {
  it('equips an owned armor instance into its catalog slot', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip(ids[0]!, inventory)).toBe(true)
    expect(equipment.getSlot('body')).toBe(ids[0])
  })

  it('rejects a non-armor instance', () => {
    const inventory = new Inventory({})
    const knife = { id: 'knife:1', kind: 'knife' as const, durability: 1, sharpness: 1 }
    inventory.addInstance(knife)
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip(knife.id, inventory)).toBe(false)
    expect(equipment.getSlot('body')).toBeNull()
  })

  it('rejects an armor instance not owned by inventory', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip('missing', inventory)).toBe(false)
    expect(equipment.getSlot('body')).toBeNull()
  })

  it('equipping a second body item replaces the first', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' }, { kind: 'chainmail' })
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip(ids[0]!, inventory)).toBe(true)
    expect(equipment.equip(ids[1]!, inventory)).toBe(true)
    expect(equipment.getSlot('body')).toBe(ids[1])
  })

  it('unequip clears only the requested slot', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    equipment.unequip('body')
    expect(equipment.getSlot('body')).toBeNull()
  })

  it('syncWithInventory clears a stale reference', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    inventory.removeInstance(ids[0]!)
    equipment.syncWithInventory(inventory)
    expect(equipment.getSlot('body')).toBeNull()
  })

  it('restores a valid saved instance id', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'chainmail' })
    const equipment = createEquipmentState(inventory, { body: ids[0] })
    expect(equipment.getSlot('body')).toBe(ids[0])
  })

  it('restores empty when the saved instance is no longer owned', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory, { body: 'gone' })
    expect(equipment.getSlot('body')).toBeNull()
  })

  it('maps legacy body ItemKind to an owned instance after migration', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'chainmail' })
    const equipment = createEquipmentState(inventory, { body: 'chainmail' as never })
    expect(equipment.getSlot('body')).toBe(ids[0])
  })

  it('same instance cannot occupy multiple slots after restore', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory, { body: ids[0], head: ids[0] })
    const occupied = ['body', 'head'] as const
    const live = occupied.filter((slot) => equipment.getSlot(slot) === ids[0])
    expect(live.length).toBe(1)
  })
})

describe('equippedBodyArmor / equippedInstanceId (no-ghost-equipment invariant)', () => {
  it('is null with nothing equipped', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(equippedBodyArmor(equipment, inventory)).toBeNull()
    expect(equippedInstanceId(equipment, inventory, 'body')).toBeNull()
  })

  it('reflects a valid owned selection', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    expect(equippedBodyArmor(equipment, inventory)).toBe('leather_armor')
    expect(equippedInstanceId(equipment, inventory, 'body')).toBe(ids[0])
  })

  it('resolves to null the instant the item leaves inventory, even without syncWithInventory', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'leather_armor' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    inventory.removeInstance(ids[0]!)
    expect(equipment.getSlot('body')).toBe(ids[0])
    expect(equippedBodyArmor(equipment, inventory)).toBeNull()
    expect(equippedInstanceId(equipment, inventory, 'body')).toBeNull()
  })
})

describe('resolveEquipmentModifiers', () => {
  it('is all-neutral with nothing equipped', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(resolveEquipmentModifiers(equipment, inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })

  it('maps catalog armor values for a valid owned selection', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'chainmail' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    const modifiers = resolveEquipmentModifiers(equipment, inventory)
    expect(modifiers.incomingDamageMultiplier).toBeLessThan(1)
    expect(modifiers.incomingDamageMultiplier).toBeGreaterThan(0)
    expect(modifiers.meleeStaminaMultiplier).toBeGreaterThan(1)
    expect(modifiers.meleeRecoveryMultiplier).toBeGreaterThan(1)
    expect(modifiers.movementSpeedMultiplier).toBeLessThan(1)
    expect(modifiers.sprintStaminaMultiplier).toBeGreaterThan(1)
  })

  it('never leaves a ghost bonus after the item stops being owned', () => {
    const { inventory, ids } = inventoryWithArmor({ kind: 'chainmail' })
    const equipment = createEquipmentState(inventory)
    equipment.equip(ids[0]!, inventory)
    inventory.removeInstance(ids[0]!)
    expect(resolveEquipmentModifiers(equipment, inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })

  it('chainmail trades more protection for more cost than leather', () => {
    const leather = inventoryWithArmor({ kind: 'leather_armor' })
    const leatherEquipment = createEquipmentState(leather.inventory)
    leatherEquipment.equip(leather.ids[0]!, leather.inventory)
    const leatherMods = resolveEquipmentModifiers(leatherEquipment, leather.inventory)

    const chainmail = inventoryWithArmor({ kind: 'chainmail' })
    const chainmailEquipment = createEquipmentState(chainmail.inventory)
    chainmailEquipment.equip(chainmail.ids[0]!, chainmail.inventory)
    const chainmailMods = resolveEquipmentModifiers(chainmailEquipment, chainmail.inventory)

    expect(chainmailMods.incomingDamageMultiplier).toBeLessThan(leatherMods.incomingDamageMultiplier)
    expect(chainmailMods.movementSpeedMultiplier).toBeLessThan(leatherMods.movementSpeedMultiplier)
    expect(chainmailMods.meleeStaminaMultiplier).toBeGreaterThan(leatherMods.meleeStaminaMultiplier)
  })

  it('higher quality improves protection and reduces penalties vs common', () => {
    const common = inventoryWithArmor({ kind: 'chainmail', quality: 'common' })
    const masterwork = inventoryWithArmor({ kind: 'chainmail', quality: 'masterwork' })
    const commonEq = createEquipmentState(common.inventory)
    const mwEq = createEquipmentState(masterwork.inventory)
    commonEq.equip(common.ids[0]!, common.inventory)
    mwEq.equip(masterwork.ids[0]!, masterwork.inventory)
    const c = resolveEquipmentModifiers(commonEq, common.inventory)
    const m = resolveEquipmentModifiers(mwEq, masterwork.inventory)
    expect(m.incomingDamageMultiplier).toBeLessThan(c.incomingDamageMultiplier)
    expect(m.meleeStaminaMultiplier).toBeLessThan(c.meleeStaminaMultiplier)
    expect(m.movementSpeedMultiplier).toBeGreaterThan(c.movementSpeedMultiplier)
    expect(masterwork.inventory.totalWeight()).toBeLessThan(common.inventory.totalWeight())
  })

  it('multi-piece protection multiplies remaining damage and stays bounded', () => {
    const base = ITEM_CATALOG.leather_armor.armor!
    const piece = resolveEffectiveArmorPiece(base, 'common', ITEM_DEFS.leather_armor.weight)
    const composed = composeEquipmentModifiers([piece, piece, piece, piece, piece, piece])
    expect(composed.incomingDamageMultiplier).toBeGreaterThan(0)
    expect(composed.incomingDamageMultiplier).toBeLessThan(1 - piece.damageReduction)
    expect(composed.incomingDamageMultiplier).toBeCloseTo((1 - piece.damageReduction) ** 6)
  })
})
