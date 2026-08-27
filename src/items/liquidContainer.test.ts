import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import {
  canDrinkFromLiquidContainer,
  canFillLiquidContainer,
  createLiquidContainerInstance,
  drinkFromLiquidContainer,
  emptyLiquidContainer,
  fillLiquidContainer,
  LIQUID_DENSITY_KG_PER_LITRE,
  liquidContainerCapacity,
  migrateLegacyWaterskinsToInstances,
} from './liquidContainer'

describe('liquidContainerCapacity', () => {
  it('reads capacity from the catalog per kind', () => {
    expect(liquidContainerCapacity('waterskin_small')).toBe(2)
    expect(liquidContainerCapacity('waterskin_medium')).toBe(5)
    expect(liquidContainerCapacity('waterskin_large')).toBe(10)
    expect(liquidContainerCapacity('wooden_bucket')).toBe(10)
    expect(liquidContainerCapacity('copper_bucket')).toBe(10)
  })
})

describe('fillLiquidContainer / canFillLiquidContainer', () => {
  it('fills an empty container to full', () => {
    const empty = createLiquidContainerInstance('waterskin_small')
    expect(canFillLiquidContainer(empty, 'water')).toBe(true)
    const filled = fillLiquidContainer(empty, 'water')
    expect(filled).toEqual({ id: empty.id, kind: 'waterskin_small', liquid: 'water', amountLitres: 2 })
  })

  it('tops up an already-partial container of the same content', () => {
    const partial = { ...createLiquidContainerInstance('waterskin_medium'), liquid: 'water' as const, amountLitres: 2 }
    const filled = fillLiquidContainer(partial, 'water')
    expect(filled?.amountLitres).toBe(5)
  })

  it('refuses to fill an already-full container', () => {
    const full = { ...createLiquidContainerInstance('waterskin_small'), liquid: 'water' as const, amountLitres: 2 }
    expect(canFillLiquidContainer(full, 'water')).toBe(false)
    expect(fillLiquidContainer(full, 'water')).toBeNull()
  })

  it('rejects milk into a waterskin', () => {
    const empty = createLiquidContainerInstance('waterskin_small')
    expect(canFillLiquidContainer(empty, 'milk')).toBe(false)
    expect(fillLiquidContainer(empty, 'milk')).toBeNull()
  })

  it('accepts both water and milk into a bucket', () => {
    const woodenWater = fillLiquidContainer(createLiquidContainerInstance('wooden_bucket'), 'water')
    expect(woodenWater?.liquid).toBe('water')
    const copperMilk = fillLiquidContainer(createLiquidContainerInstance('copper_bucket'), 'milk')
    expect(copperMilk?.liquid).toBe('milk')
  })

  it('refuses to mix content — must empty before switching', () => {
    const waterBucket = { ...createLiquidContainerInstance('wooden_bucket'), liquid: 'water' as const, amountLitres: 3 }
    expect(canFillLiquidContainer(waterBucket, 'milk')).toBe(false)
    expect(fillLiquidContainer(waterBucket, 'milk')).toBeNull()
    const emptied = emptyLiquidContainer(waterBucket)
    expect(canFillLiquidContainer(emptied, 'milk')).toBe(true)
  })
})

describe('drinkFromLiquidContainer / canDrinkFromLiquidContainer', () => {
  it('consumes exactly one drink portion per call', () => {
    const full = fillLiquidContainer(createLiquidContainerInstance('waterskin_medium'), 'water')!
    expect(full.amountLitres).toBe(5)
    const afterOne = drinkFromLiquidContainer(full)!
    expect(afterOne.amountLitres).toBe(4)
    expect(afterOne.liquid).toBe('water')
  })

  it('rejects drinking from an empty container', () => {
    const empty = createLiquidContainerInstance('waterskin_small')
    expect(canDrinkFromLiquidContainer(empty)).toBe(false)
    expect(drinkFromLiquidContainer(empty)).toBeNull()
  })

  it('empties the content but keeps the instance present at zero', () => {
    const full = fillLiquidContainer(createLiquidContainerInstance('waterskin_small'), 'water')!
    const afterOne = drinkFromLiquidContainer(full)!
    const afterTwo = drinkFromLiquidContainer(afterOne)!
    expect(afterTwo).toEqual({ id: full.id, kind: 'waterskin_small', liquid: null, amountLitres: 0 })
    // Empty and reusable — filling it again works exactly like a fresh instance.
    expect(canFillLiquidContainer(afterTwo, 'water')).toBe(true)
  })
})

describe('Inventory liquid-container round trip (plan items-player-001)', () => {
  it('adds a fresh empty instance and round-trips it through save/load', () => {
    const inv = new Inventory()
    const instance = createLiquidContainerInstance('waterskin_small')
    expect(inv.addInstance(instance)).toBe(true)
    expect(inv.countInstances('waterskin_small')).toBe(1)

    const filled = fillLiquidContainer(inv.getInstance(instance.id) as ReturnType<typeof createLiquidContainerInstance>, 'water')!
    expect(inv.updateInstance(instance.id, () => filled)).toBe(true)

    const json = inv.instancesToJSON()
    expect(json).toEqual([{ id: instance.id, kind: 'waterskin_small', liquid: 'water', amountLitres: 2 }])

    const restored = Inventory.instancesFromJSON(json)
    expect(restored).toEqual([{ id: instance.id, kind: 'waterskin_small', liquid: 'water', amountLitres: 2 }])
  })

  it('round-trips an empty instance without a liquid/amountLitres row', () => {
    const inv = new Inventory()
    const instance = createLiquidContainerInstance('wooden_bucket')
    inv.addInstance(instance)
    const json = inv.instancesToJSON()
    expect(json).toEqual([{ id: instance.id, kind: 'wooden_bucket' }])
    const restored = Inventory.instancesFromJSON(json)
    expect(restored).toEqual([{ id: instance.id, kind: 'wooden_bucket', liquid: null, amountLitres: 0 }])
  })

  it('clamps a corrupted amountLitres above the kind capacity on restore', () => {
    const restored = Inventory.instancesFromJSON([
      { id: 'x', kind: 'waterskin_small', liquid: 'water', amountLitres: 999 },
    ])
    expect(restored).toEqual([{ id: 'x', kind: 'waterskin_small', liquid: 'water', amountLitres: 2 }])
  })

  it('adds held-liquid mass on top of the empty container weight', () => {
    const inv = new Inventory()
    const empty = createLiquidContainerInstance('waterskin_medium')
    inv.addInstance(empty)
    const emptyWeight = inv.totalWeight()
    inv.updateInstance(empty.id, (inst) => fillLiquidContainer(inst as ReturnType<typeof createLiquidContainerInstance>, 'water')!)
    const fullWeight = inv.totalWeight()
    expect(fullWeight - emptyWeight).toBeCloseTo(5 * LIQUID_DENSITY_KG_PER_LITRE)
  })
})

describe('migrateLegacyWaterskinsToInstances (plan items-player-001)', () => {
  it('converts legacy empty/full counts into waterskin_medium instances', () => {
    const inv = new Inventory({ waterskin_empty: 2, waterskin_full: 1 })
    migrateLegacyWaterskinsToInstances(inv)
    expect(inv.count('waterskin_empty')).toBe(0)
    expect(inv.count('waterskin_full')).toBe(0)
    const instances = inv.getInstances('waterskin_medium')
    expect(instances).toHaveLength(3)
    const empties = instances.filter((i) => 'amountLitres' in i && (i as { amountLitres: number }).amountLitres === 0)
    const fulls = instances.filter((i) => 'amountLitres' in i && (i as { amountLitres: number }).amountLitres === 5)
    expect(empties).toHaveLength(2)
    expect(fulls).toHaveLength(1)
  })

  it('is a no-op when nothing legacy is carried', () => {
    const inv = new Inventory()
    migrateLegacyWaterskinsToInstances(inv)
    expect(inv.getInstances('waterskin_medium')).toHaveLength(0)
  })
})
