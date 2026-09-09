import { describe, expect, it } from 'vitest'
import { createFoodBatch } from './foodFreshness'
import { Inventory } from './Inventory'
import { transferInventoryCount, transferInventoryInstance } from './inventoryTransfer'
import { createWeaponInstance } from './weaponMaintenance'

describe('transferInventoryCount', () => {
  it('moves stack counts without duplicating them', () => {
    const source = new Inventory()
    const destination = new Inventory()
    source.add('stone', 4)
    expect(transferInventoryCount(source, destination, 'stone', 3)).toBe(true)
    expect(source.count('stone')).toBe(1)
    expect(destination.count('stone')).toBe(3)
  })

  it('leaves both inventories unchanged when the destination cannot accept the load', () => {
    const source = new Inventory()
    const destination = new Inventory({}, 0.001)
    source.add('stone', 5)
    expect(transferInventoryCount(source, destination, 'stone', 1)).toBe(false)
    expect(source.count('stone')).toBe(5)
    expect(destination.count('stone')).toBe(0)
  })

  it('leaves both inventories unchanged when the source is short', () => {
    const source = new Inventory()
    const destination = new Inventory()
    source.add('stone', 1)
    expect(transferInventoryCount(source, destination, 'stone', 2)).toBe(false)
    expect(source.count('stone')).toBe(1)
    expect(destination.isEmpty()).toBe(true)
  })

  it('preserves perishable freshness across a successful transfer', () => {
    const source = new Inventory()
    const destination = new Inventory()
    const batch = createFoodBatch(3, 2, 1)
    expect(source.addWithFreshness('berries', 3, [batch], 2)).toBe(true)
    expect(transferInventoryCount(source, destination, 'berries', 2, 4)).toBe(true)
    expect(source.count('berries')).toBe(1)
    expect(destination.count('berries')).toBe(2)
    const moved = destination.getFoodBatches('berries', 4)
    expect(moved[0]?.acquiredAtDays).toBe(2)
    expect(moved[0]?.count).toBe(2)
  })
})

describe('transferInventoryInstance', () => {
  it('moves an instance by id without duplicating it', () => {
    const source = new Inventory()
    const destination = new Inventory()
    const knife = createWeaponInstance('knife')
    knife.durability = 0.55
    expect(source.addInstance(knife)).toBe(true)
    expect(transferInventoryInstance(source, destination, knife.id)).toBe(true)
    expect(source.getInstance(knife.id)).toBeNull()
    expect(destination.getInstance(knife.id)).toMatchObject({ id: knife.id, durability: 0.55 })
  })

  it('leaves both inventories unchanged when the destination is full', () => {
    const source = new Inventory()
    const destination = new Inventory({}, 0.001)
    const knife = createWeaponInstance('knife')
    expect(source.addInstance(knife)).toBe(true)
    expect(transferInventoryInstance(source, destination, knife.id)).toBe(false)
    expect(source.getInstance(knife.id)?.id).toBe(knife.id)
    expect(destination.getInstance(knife.id)).toBeNull()
  })
})
