import { describe, expect, it } from 'vitest'
import { createHeldTool } from './HeldTool'
import { Inventory } from './Inventory'
import { createWeaponInstance } from './weaponMaintenance'

describe('createHeldTool', () => {
  it('equips a tool that is in inventory', () => {
    const inventory = new Inventory({ shovel: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('shovel')).toBe(true)
    expect(held.held()).toBe('shovel')
  })

  it('equips an axe from inventory', () => {
    const inventory = new Inventory({}, undefined, [createWeaponInstance('axe')])
    const held = createHeldTool(inventory)
    expect(held.equip('axe')).toBe(true)
    expect(held.held()).toBe('axe')
    expect(held.heldInstanceId()).not.toBeNull()
  })

  it('equips pickaxe and long_sword from inventory (plan 090)', () => {
    const inventory = new Inventory({ pickaxe: 1 }, undefined, [createWeaponInstance('long_sword')])
    const held = createHeldTool(inventory)
    expect(held.equip('pickaxe')).toBe(true)
    expect(held.held()).toBe('pickaxe')
    expect(held.equip('long_sword')).toBe(true)
    expect(held.held()).toBe('long_sword')
  })

  it('rejects non-tools and missing items', () => {
    const inventory = new Inventory({ stone: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('stone')).toBe(false)
    expect(held.equip('shovel')).toBe(false)
    expect(held.held()).toBeNull()
  })

  it('equips pitchfork and sickle from inventory (plan 096)', () => {
    const inventory = new Inventory({}, undefined, [createWeaponInstance('pitchfork'), createWeaponInstance('sickle')])
    const held = createHeldTool(inventory)
    expect(held.equip('pitchfork')).toBe(true)
    expect(held.held()).toBe('pitchfork')
    expect(held.equip('sickle')).toBe(true)
    expect(held.held()).toBe('sickle')
  })

  it('equips plan-160 high-quality weapons from inventory', () => {
    const inventory = new Inventory({}, undefined, [createWeaponInstance('damascus_knife'), createWeaponInstance('masterwork_sword')])
    const held = createHeldTool(inventory)
    expect(held.equip('damascus_knife')).toBe(true)
    expect(held.held()).toBe('damascus_knife')
    expect(held.equip('masterwork_sword')).toBe(true)
    expect(held.held()).toBe('masterwork_sword')
  })

  it('clears the slot when the tool leaves inventory', () => {
    const inventory = new Inventory({ shovel: 1 })
    const held = createHeldTool(inventory, 'shovel')
    expect(held.held()).toBe('shovel')
    inventory.remove('shovel', 1)
    held.syncWithInventory()
    expect(held.held()).toBeNull()
  })

  it('binds a specific weapon instance and re-resolves it after removal (plan 161)', () => {
    const a = createWeaponInstance('knife')
    const b = createWeaponInstance('knife')
    const inventory = new Inventory({}, undefined, [a, b])
    const held = createHeldTool(inventory)
    expect(held.equip('knife', a.id)).toBe(true)
    expect(held.heldInstanceId()).toBe(a.id)
    inventory.removeInstance(a.id)
    held.syncWithInventory()
    expect(held.held()).toBe('knife')
    expect(held.heldInstanceId()).toBe(b.id)
  })
})
