import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { buildInventoryGroups, ITEM_METER_LABEL } from './inventoryView'
import { createTentInstance, type LiquidContainerItemInstance, type TrapItemInstance } from './itemInstances'
import { createTrapInstance } from './trapItemInstances'
import { createWeaponInstance } from './weaponMaintenance'

function liquidInstance(id: string, kind: LiquidContainerItemInstance['kind'], amountLitres: number): LiquidContainerItemInstance {
  return { id, kind, liquid: amountLitres > 0 ? 'water' : null, amountLitres }
}

describe('buildInventoryGroups — instance-backed coverage (plan items-player-024)', () => {
  it('does not silently lose an owned tent instance', () => {
    const inventory = new Inventory({})
    inventory.addInstance(createTentInstance(100))
    const groups = buildInventoryGroups(inventory)
    const tentGroup = groups.find((g) => g.kind === 'tent')
    expect(tentGroup).toBeDefined()
    expect(tentGroup!.count).toBe(1)
  })

  it('exposes correct meter semantics for trap/weapon/liquid/tent', () => {
    const inventory = new Inventory({})
    inventory.addInstance(createTrapInstance('trap_simple'))
    inventory.addInstance(createWeaponInstance('knife'))
    inventory.addInstance(liquidInstance('liq:1', 'waterskin_small', 1))
    inventory.addInstance(createTentInstance(80))
    const groups = buildInventoryGroups(inventory)

    const trapGroup = groups.find((g) => g.kind === 'trap_simple')!
    expect(trapGroup.meterKind).toBe('condition')
    expect(trapGroup.instances[0]!.meterKind).toBe('condition')

    const weaponGroup = groups.find((g) => g.kind === 'knife')!
    expect(weaponGroup.meterKind).toBe('durability')
    expect(weaponGroup.instances[0]!.meterKind).toBe('durability')
    expect(weaponGroup.instances[0]!.sharpnessPercent).toBe(100)

    const liquidGroup = groups.find((g) => g.kind === 'waterskin_small')!
    expect(liquidGroup.meterKind).toBe('fill')
    expect(liquidGroup.instances[0]!.meterKind).toBe('fill')
    expect(liquidGroup.instances[0]!.conditionPercent).toBe(50)

    const tentGroup = groups.find((g) => g.kind === 'tent')!
    expect(tentGroup.meterKind).toBe('condition')
    expect(tentGroup.instances[0]!.conditionPercent).toBe(80)

    // Every meter kind maps to a real, non-anonymous label.
    for (const group of [trapGroup, weaponGroup, liquidGroup, tentGroup]) {
      expect(ITEM_METER_LABEL[group.meterKind!]).toBeTruthy()
    }
  })

  it('reports mixed condition when instances of the same kind differ', () => {
    const inventory = new Inventory({})
    inventory.addInstance(createTrapInstance('trap_simple'))
    const firstId = inventory.getInstances('trap_simple')[0]!.id
    inventory.updateInstance(firstId, (inst) => ({ ...(inst as TrapItemInstance), durability: (inst as TrapItemInstance).durability - 10 }))
    inventory.addInstance(createTrapInstance('trap_simple'))
    const group = buildInventoryGroups(inventory).find((g) => g.kind === 'trap_simple')!
    expect(group.condition).toBe('mixed')
    expect(group.uniformConditionPercent).toBeNull()
  })

  it('never loses any owned instance-backed kind from INSTANCE_BACKED_KINDS', () => {
    const inventory = new Inventory({})
    inventory.addInstance(createTrapInstance('trap_good'))
    inventory.addInstance(createWeaponInstance('long_sword'))
    inventory.addInstance(liquidInstance('liq:2', 'wooden_bucket', 5))
    inventory.addInstance(createTentInstance())
    const groups = buildInventoryGroups(inventory)
    const kinds = groups.map((g) => g.kind)
    expect(kinds).toEqual(expect.arrayContaining(['trap_good', 'long_sword', 'wooden_bucket', 'tent']))
  })
})

describe('buildInventoryGroups — consumeUse (plan items-player-024)', () => {
  it('is null for a non-consumable kind', () => {
    const inventory = new Inventory({ stone: 3 })
    const group = buildInventoryGroups(inventory).find((g) => g.kind === 'stone')!
    expect(group.consumeUse).toBeNull()
  })

  it('is enabled for fresh food', () => {
    const inventory = new Inventory({})
    inventory.add('mushroom', 1, 0)
    const group = buildInventoryGroups(inventory, 0).find((g) => g.kind === 'mushroom')!
    expect(group.consumeUse).not.toBeNull()
    expect(group.consumeUse!.enabled).toBe(true)
    expect(group.consumeUse!.reasonLabel).toBe('')
  })

  it('is disabled with a reason for spoiled food', () => {
    const inventory = new Inventory({})
    inventory.add('mushroom', 1, 0)
    // Mushroom fresh/medium duration is 1.5 days — far past that is spoiled.
    const group = buildInventoryGroups(inventory, 100).find((g) => g.kind === 'mushroom')!
    expect(group.consumeUse!.enabled).toBe(false)
    expect(group.consumeUse!.reasonLabel).toBe('Zepsute')
  })

  it('is disabled with a reason for an empty liquid container', () => {
    const inventory = new Inventory({})
    inventory.addInstance(liquidInstance('liq:3', 'waterskin_small', 0))
    const group = buildInventoryGroups(inventory).find((g) => g.kind === 'waterskin_small')!
    expect(group.consumeUse!.enabled).toBe(false)
    expect(group.consumeUse!.reasonLabel).toBe('Pusty')
  })

  it('is enabled for a filled liquid container', () => {
    const inventory = new Inventory({})
    inventory.addInstance(liquidInstance('liq:4', 'waterskin_small', 2))
    const group = buildInventoryGroups(inventory).find((g) => g.kind === 'waterskin_small')!
    expect(group.consumeUse!.enabled).toBe(true)
  })
})
