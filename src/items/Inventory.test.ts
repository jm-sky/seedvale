import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { createTrapInstance } from './trapItemInstances'

describe('Inventory instances (plan 155)', () => {
  it('adds, gets and removes an instance by id', () => {
    const inv = new Inventory()
    const trap = createTrapInstance('trap_simple')
    expect(inv.addInstance(trap)).toBe(true)
    expect(inv.getInstance(trap.id)?.kind).toBe('trap_simple')
    expect(inv.countInstances('trap_simple')).toBe(1)
    expect(inv.removeInstance(trap.id)).toBe(true)
    expect(inv.getInstance(trap.id)).toBeNull()
  })

  it('rejects duplicate instance ids', () => {
    const inv = new Inventory()
    const trap = createTrapInstance('trap_simple')
    expect(inv.addInstance(trap)).toBe(true)
    expect(inv.addInstance(trap)).toBe(false)
  })

  it('includes instance weight in totalWeight and capacity checks', () => {
    const inv = new Inventory({}, 1)
    const trap = createTrapInstance('trap_simple')
    expect(inv.canAddInstance(trap)).toBe(false)
    expect(inv.addInstance(trap)).toBe(false)
    expect(inv.isEmpty()).toBe(true)
  })

  it('clears instances with clear()', () => {
    const inv = new Inventory()
    inv.addInstance(createTrapInstance('trap_simple'))
    inv.clear()
    expect(inv.countInstances('trap_simple')).toBe(0)
    expect(inv.isEmpty()).toBe(true)
  })

  it('keeps count API separate from instances', () => {
    const inv = new Inventory()
    inv.add('branch', 2)
    inv.addInstance(createTrapInstance('trap_good'))
    expect(inv.count('trap_good')).toBe(0)
    expect(inv.countInstances('trap_good')).toBe(1)
    expect(inv.has('branch', 2)).toBe(true)
  })

  it('round-trips instances through JSON helpers', () => {
    const inv = new Inventory()
    const trap = createTrapInstance('trap_simple')
    trap.durability = 1
    inv.addInstance(trap)
    const json = inv.instancesToJSON()
    const restored = Inventory.instancesFromJSON(json)
    expect(restored).toEqual([{ id: trap.id, kind: 'trap_simple', durability: 1 }])
  })
})

describe('Inventory food batches (plan 159)', () => {
  it('does not track batches for non-perishable kinds', () => {
    const inv = new Inventory()
    inv.add('stone', 3)
    expect(inv.getFoodBatches('stone')).toEqual([])
    expect(inv.oldestAcquiredAtDays('stone')).toBeNull()
  })

  it('merges compatible-age additions into one batch', () => {
    const inv = new Inventory()
    inv.add('berries', 2, 5)
    inv.add('berries', 1, 5.1)
    expect(inv.count('berries')).toBe(3)
    const batches = inv.getFoodBatches('berries')
    expect(batches).toHaveLength(1)
    expect(batches[0]!.count).toBe(3)
  })

  it('keeps incompatible-age additions as separate batches', () => {
    const inv = new Inventory()
    inv.add('berries', 1, 0)
    inv.add('berries', 1, 10)
    expect(inv.count('berries')).toBe(2)
    expect(inv.getFoodBatches('berries')).toHaveLength(2)
  })

  it('removes from the oldest batch first', () => {
    const inv = new Inventory()
    inv.add('berries', 1, 0)
    inv.add('berries', 1, 10)
    expect(inv.oldestAcquiredAtDays('berries')).toBe(0)
    expect(inv.remove('berries', 1)).toBe(true)
    expect(inv.oldestAcquiredAtDays('berries')).toBe(10)
    expect(inv.count('berries')).toBe(1)
  })

  it('drops empty batch entries once fully removed', () => {
    const inv = new Inventory()
    inv.add('berries', 2, 0)
    inv.remove('berries', 2)
    expect(inv.getFoodBatches('berries')).toEqual([])
    expect(inv.count('berries')).toBe(0)
  })

  it('restores batches from the constructor and persists them via foodBatchesToJSON', () => {
    const inv = new Inventory({ berries: 2 }, undefined, undefined, { berries: [{ count: 2, acquiredAtDays: 3 }] })
    expect(inv.count('berries')).toBe(2)
    expect(inv.getFoodBatches('berries')).toEqual([{ count: 2, acquiredAtDays: 3 }])
    expect(inv.foodBatchesToJSON()).toEqual({ berries: [{ count: 2, acquiredAtDays: 3 }] })
  })

  it('clears batches with clear()', () => {
    const inv = new Inventory()
    inv.add('berries', 1, 0)
    inv.clear()
    expect(inv.getFoodBatches('berries')).toEqual([])
  })
})
