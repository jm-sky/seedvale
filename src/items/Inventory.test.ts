import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { isWeaponItemInstance } from './itemInstances'
import { itemSizeUnits } from './items'
import { createTrapInstance } from './trapItemInstances'
import { createWeaponInstance } from './weaponMaintenance'

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

describe('Inventory backpack capacity (plan 186)', () => {
  it('maxWeight equals the base capacity without a backpack', () => {
    const inv = new Inventory({}, 20)
    expect(inv.maxWeight).toBe(20)
  })

  it('a carried backpack raises maxWeight by its catalog bonus', () => {
    const inv = new Inventory({}, 20)
    expect(inv.add('backpack', 1)).toBe(true)
    expect(inv.maxWeight).toBe(35)
  })

  it('stacks the bonus across more than one carried backpack', () => {
    const inv = new Inventory({}, 20)
    inv.add('backpack', 2)
    expect(inv.maxWeight).toBe(50)
  })

  it('must fit under the pre-bonus capacity to be picked up at all', () => {
    const inv = new Inventory({}, 1)
    expect(inv.canAdd('backpack', 1)).toBe(false)
    expect(inv.add('backpack', 1)).toBe(false)
  })

  it('canAdd uses the post-backpack effective capacity for further items', () => {
    const inv = new Inventory({}, 3)
    inv.add('backpack', 1) // weight 2, leaves 1kg of the base 3kg before the bonus applies
    expect(inv.maxWeight).toBe(18)
    expect(inv.canAdd('stone', 10)).toBe(true)
  })

  it('removing the backpack drops the bonus again', () => {
    const inv = new Inventory({}, 20)
    inv.add('backpack', 1)
    expect(inv.maxWeight).toBe(35)
    inv.remove('backpack', 1)
    expect(inv.maxWeight).toBe(20)
  })
})

describe('Inventory weapon instances (plan 161)', () => {
  it('creates a new weapon instance at durability=1, sharpness=1', () => {
    const inv = new Inventory()
    const knife = createWeaponInstance('knife')
    inv.addInstance(knife)
    const stored = inv.getInstance(knife.id)
    expect(stored && isWeaponItemInstance(stored) ? stored.durability : null).toBe(1)
    expect(stored && isWeaponItemInstance(stored) ? stored.sharpness : null).toBe(1)
  })

  it('getInstance returns a clone — mutating it does not affect storage', () => {
    const inv = new Inventory()
    const knife = createWeaponInstance('knife')
    inv.addInstance(knife)
    const clone = inv.getInstance(knife.id)
    if (clone && isWeaponItemInstance(clone)) clone.sharpness = 0
    const stillStored = inv.getInstance(knife.id)
    expect(stillStored && isWeaponItemInstance(stillStored) ? stillStored.sharpness : null).toBe(1)
  })

  it('updateInstance mutates the stored state', () => {
    const inv = new Inventory()
    const knife = createWeaponInstance('knife')
    inv.addInstance(knife)
    const applied = inv.updateInstance(knife.id, (current) => (
      isWeaponItemInstance(current) ? { ...current, sharpness: 0.5 } : current
    ))
    expect(applied).toBe(true)
    const stored = inv.getInstance(knife.id)
    expect(stored && isWeaponItemInstance(stored) ? stored.sharpness : null).toBe(0.5)
  })

  it('updateInstance is a no-op for a missing id', () => {
    const inv = new Inventory()
    expect(inv.updateInstance('missing', (c) => c)).toBe(false)
  })

  it('round-trips durability and sharpness through the save JSON helpers', () => {
    const inv = new Inventory()
    const knife = createWeaponInstance('knife')
    inv.addInstance(knife)
    inv.updateInstance(knife.id, (c) => (isWeaponItemInstance(c) ? { ...c, durability: 0.8, sharpness: 0.3 } : c))
    const json = inv.instancesToJSON()
    const restored = Inventory.instancesFromJSON(json)
    expect(restored).toEqual([{ id: knife.id, kind: 'knife', durability: 0.8, sharpness: 0.3 }])
  })

  it('defaults a pre-plan-161 save row (no sharpness/durability) to full condition', () => {
    const restored = Inventory.instancesFromJSON([{ id: 'x', kind: 'knife' }])
    expect(restored).toEqual([{ id: 'x', kind: 'knife', durability: 1, sharpness: 1 }])
  })

  it('clamps out-of-range restored values', () => {
    const restored = Inventory.instancesFromJSON([{ id: 'x', kind: 'knife', durability: 5, sharpness: -2 }])
    expect(restored).toEqual([{ id: 'x', kind: 'knife', durability: 1, sharpness: 0 }])
  })

  it('leaves trap instance persistence unchanged', () => {
    const trap = createTrapInstance('trap_simple')
    const restored = Inventory.instancesFromJSON([{ id: trap.id, kind: 'trap_simple', durability: trap.durability }])
    expect(restored).toEqual([{ id: trap.id, kind: 'trap_simple', durability: trap.durability }])
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

describe('Inventory gabarite capacity (plan 164)', () => {
  it('defaults maxSize to Infinity — no size gate unless a caller opts in', () => {
    const inv = new Inventory({}, 1000)
    expect(inv.maxSize).toBe(Infinity)
    expect(inv.canAdd('stone', 500)).toBe(true)
  })

  it('gates additions on size independently of weight', () => {
    // `stone` = 1 kg, size SM (2 units) — maxWeight is generous so only the
    // 5-unit size cap can ever reject.
    const inv = new Inventory({}, 1000, undefined, undefined, 5)
    expect(itemSizeUnits('stone')).toBe(2)
    expect(inv.canAdd('stone', 2)).toBe(true)
    expect(inv.add('stone', 2)).toBe(true)
    expect(inv.totalSize()).toBe(4)
    expect(inv.canAdd('stone', 1)).toBe(false)
    expect(inv.add('stone', 1)).toBe(false)
    expect(inv.count('stone')).toBe(2)
  })

  it('gates additions on weight independently of size', () => {
    // maxSize is generous here so only the 2 kg weight cap can reject.
    const inv = new Inventory({}, 2, undefined, undefined, 1000)
    expect(inv.canAdd('stone', 2)).toBe(true)
    expect(inv.add('stone', 2)).toBe(true)
    expect(inv.canAdd('stone', 1)).toBe(false)
  })

  it('counts one instance-backed item as one physical item toward totalSize', () => {
    const inv = new Inventory({}, 1000, undefined, undefined, 1000)
    inv.add('stone', 3)
    inv.addInstance(createTrapInstance('trap_simple'))
    expect(inv.totalSize()).toBe(itemSizeUnits('stone') * 3 + itemSizeUnits('trap_simple'))
  })

  it('canAddInstance respects maxSize the same way canAdd does', () => {
    const inv = new Inventory({}, 1000, undefined, undefined, 2)
    const trap = createTrapInstance('trap_simple')
    expect(itemSizeUnits('trap_simple')).toBeGreaterThan(2)
    expect(inv.canAddInstance(trap)).toBe(false)
    expect(inv.addInstance(trap)).toBe(false)
  })
})
