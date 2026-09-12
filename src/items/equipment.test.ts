import { describe, expect, it } from 'vitest'
import {
  createEquipmentState,
  equippedBodyArmor,
  NEUTRAL_EQUIPMENT_MODIFIERS,
  resolveEquipmentModifiers,
} from './equipment'
import { Inventory } from './Inventory'

describe('createEquipmentState', () => {
  it('equips an owned body-armor item', () => {
    const inventory = new Inventory({ leather_armor: 1 })
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip('leather_armor', inventory)).toBe(true)
    expect(equipment.body()).toBe('leather_armor')
  })

  it('rejects a non-armor kind', () => {
    const inventory = new Inventory({ knife: 1 })
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip('knife', inventory)).toBe(false)
    expect(equipment.body()).toBeNull()
  })

  it('rejects an armor kind not owned by inventory', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip('chainmail', inventory)).toBe(false)
    expect(equipment.body()).toBeNull()
  })

  it('equipping a second body item replaces the first', () => {
    const inventory = new Inventory({ leather_armor: 1, chainmail: 1 })
    const equipment = createEquipmentState(inventory)
    expect(equipment.equip('leather_armor', inventory)).toBe(true)
    expect(equipment.equip('chainmail', inventory)).toBe(true)
    expect(equipment.body()).toBe('chainmail')
  })

  it('unequip clears only the body slot', () => {
    const inventory = new Inventory({ leather_armor: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('leather_armor', inventory)
    equipment.unequip('body')
    expect(equipment.body()).toBeNull()
  })

  it('syncWithInventory clears a stale reference', () => {
    const inventory = new Inventory({ leather_armor: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('leather_armor', inventory)
    inventory.remove('leather_armor', 1)
    equipment.syncWithInventory(inventory)
    expect(equipment.body()).toBeNull()
  })

  it('restores a valid saved selection', () => {
    const inventory = new Inventory({ chainmail: 1 })
    const equipment = createEquipmentState(inventory, { body: 'chainmail' })
    expect(equipment.body()).toBe('chainmail')
  })

  it('restores empty when the saved kind is no longer owned', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory, { body: 'chainmail' })
    expect(equipment.body()).toBeNull()
  })

  it('restores empty for a saved non-armor kind (old/corrupt save)', () => {
    const inventory = new Inventory({ knife: 1 })
    const equipment = createEquipmentState(inventory, { body: 'knife' as never })
    expect(equipment.body()).toBeNull()
  })
})

describe('equippedBodyArmor (no-ghost-equipment invariant)', () => {
  it('is null with nothing equipped', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(equippedBodyArmor(equipment, inventory)).toBeNull()
  })

  it('reflects a valid owned selection', () => {
    const inventory = new Inventory({ leather_armor: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('leather_armor', inventory)
    expect(equippedBodyArmor(equipment, inventory)).toBe('leather_armor')
  })

  it('resolves to null the instant the item leaves inventory, even without syncWithInventory', () => {
    const inventory = new Inventory({ leather_armor: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('leather_armor', inventory)
    inventory.remove('leather_armor', 1)
    // Deliberately no `equipment.syncWithInventory()` call here — the raw
    // `body()` reference is still stale, but the live-valid getter must not be.
    expect(equipment.body()).toBe('leather_armor')
    expect(equippedBodyArmor(equipment, inventory)).toBeNull()
  })
})

describe('resolveEquipmentModifiers', () => {
  it('is all-neutral with nothing equipped', () => {
    const inventory = new Inventory({})
    const equipment = createEquipmentState(inventory)
    expect(resolveEquipmentModifiers(equipment, inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })

  it('maps catalog armor values for a valid owned selection', () => {
    const inventory = new Inventory({ chainmail: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('chainmail', inventory)
    const modifiers = resolveEquipmentModifiers(equipment, inventory)
    expect(modifiers.incomingDamageMultiplier).toBeLessThan(1)
    expect(modifiers.incomingDamageMultiplier).toBeGreaterThan(0)
    expect(modifiers.meleeStaminaMultiplier).toBeGreaterThan(1)
    expect(modifiers.meleeRecoveryMultiplier).toBeGreaterThan(1)
    expect(modifiers.movementSpeedMultiplier).toBeLessThan(1)
    expect(modifiers.sprintStaminaMultiplier).toBeGreaterThan(1)
  })

  it('never leaves a ghost bonus after the item stops being owned', () => {
    const inventory = new Inventory({ chainmail: 1 })
    const equipment = createEquipmentState(inventory)
    equipment.equip('chainmail', inventory)
    inventory.remove('chainmail', 1)
    expect(resolveEquipmentModifiers(equipment, inventory)).toEqual(NEUTRAL_EQUIPMENT_MODIFIERS)
  })

  it('chainmail trades more protection for more cost than leather (horizontal, not flat, tiers)', () => {
    const leatherInventory = new Inventory({ leather_armor: 1 })
    const leatherEquipment = createEquipmentState(leatherInventory)
    leatherEquipment.equip('leather_armor', leatherInventory)
    const leather = resolveEquipmentModifiers(leatherEquipment, leatherInventory)

    const chainmailInventory = new Inventory({ chainmail: 1 })
    const chainmailEquipment = createEquipmentState(chainmailInventory)
    chainmailEquipment.equip('chainmail', chainmailInventory)
    const chainmail = resolveEquipmentModifiers(chainmailEquipment, chainmailInventory)

    expect(chainmail.incomingDamageMultiplier).toBeLessThan(leather.incomingDamageMultiplier)
    expect(chainmail.movementSpeedMultiplier).toBeLessThan(leather.movementSpeedMultiplier)
    expect(chainmail.meleeStaminaMultiplier).toBeGreaterThan(leather.meleeStaminaMultiplier)
  })
})
