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
