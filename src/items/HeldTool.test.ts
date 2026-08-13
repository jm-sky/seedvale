import { describe, expect, it } from 'vitest'
import { createHeldTool } from './HeldTool'
import { Inventory } from './Inventory'

describe('createHeldTool', () => {
  it('equips a tool that is in inventory', () => {
    const inventory = new Inventory({ shovel: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('shovel')).toBe(true)
    expect(held.held()).toBe('shovel')
  })

  it('equips an axe from inventory', () => {
    const inventory = new Inventory({ axe: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('axe')).toBe(true)
    expect(held.held()).toBe('axe')
  })

  it('equips pickaxe and long_sword from inventory (plan 090)', () => {
    const inventory = new Inventory({ pickaxe: 1, long_sword: 1 })
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

  it('rejects village farm tools that are not yet holdable (plan 082)', () => {
    const inventory = new Inventory({ pitchfork: 1, sickle: 1 })
    const held = createHeldTool(inventory)
    expect(held.equip('pitchfork')).toBe(false)
    expect(held.equip('sickle')).toBe(false)
    expect(held.held()).toBeNull()
  })

  it('clears the slot when the tool leaves inventory', () => {
    const inventory = new Inventory({ shovel: 1 })
    const held = createHeldTool(inventory, 'shovel')
    expect(held.held()).toBe('shovel')
    inventory.remove('shovel', 1)
    held.syncWithInventory()
    expect(held.held()).toBeNull()
  })
})
