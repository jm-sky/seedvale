import { describe, expect, it } from 'vitest'
import { carryFoodClaim, claimFoodItems, deliverCarriedFoodClaim, depositFoodItems, FOOD_ITEM_KINDS, foodItemCount, takeOneFoodItem } from './foodItems'
import { Inventory } from './Inventory'

describe('FOOD_ITEM_KINDS', () => {
  it('is derived from the existing food ItemCategory, not a hand-written list', () => {
    expect(FOOD_ITEM_KINDS).toContain('carrot')
    expect(FOOD_ITEM_KINDS).toContain('fish')
    expect(FOOD_ITEM_KINDS).toContain('bread')
    expect(FOOD_ITEM_KINDS).not.toContain('arrow')
    expect(FOOD_ITEM_KINDS).not.toContain('stone')
  })
})

describe('foodItemCount', () => {
  it('is zero for an empty inventory', () => {
    expect(foodItemCount(new Inventory())).toBe(0)
  })

  it('sums a single food kind', () => {
    const inv = new Inventory()
    inv.add('carrot', 2)
    expect(foodItemCount(inv)).toBe(2)
  })

  it('sums several different food kinds', () => {
    const inv = new Inventory()
    inv.add('carrot', 2)
    inv.add('fish', 1)
    inv.add('egg', 3)
    expect(foodItemCount(inv)).toBe(6)
  })

  it('ignores non-food items', () => {
    const inv = new Inventory()
    inv.add('arrow', 5)
    inv.add('hide', 2)
    expect(foodItemCount(inv)).toBe(0)
  })
})

describe('takeOneFoodItem', () => {
  it('returns null when no food is held', () => {
    expect(takeOneFoodItem(new Inventory())).toBeNull()
  })

  it('removes exactly one unit of the returned kind', () => {
    const inv = new Inventory()
    inv.add('carrot', 2)
    const kind = takeOneFoodItem(inv)
    expect(kind).toBe('carrot')
    expect(inv.count('carrot')).toBe(1)
  })

  it('is deterministic for the same held mix — never Math.random ordering', () => {
    const a = new Inventory()
    a.add('carrot', 1)
    a.add('fish', 1)
    const b = new Inventory()
    b.add('fish', 1)
    b.add('carrot', 1)
    expect(takeOneFoodItem(a)).toBe(takeOneFoodItem(b))
  })
})

describe('claimFoodItems', () => {
  it('returns an empty list for a non-positive amount', () => {
    const inv = new Inventory()
    inv.add('carrot', 5)
    expect(claimFoodItems(inv, 0)).toEqual([])
    expect(inv.count('carrot')).toBe(5)
  })

  it('claims a single kind fully when it alone covers the amount', () => {
    const inv = new Inventory()
    inv.add('carrot', 5)
    const claimed = claimFoodItems(inv, 3)
    expect(claimed).toEqual([{ kind: 'carrot', amount: 3, batches: [{ count: 3, acquiredAtDays: 0 }] }])
    expect(inv.count('carrot')).toBe(2)
  })

  it('spans multiple kinds when one alone is not enough', () => {
    const inv = new Inventory()
    inv.add('carrot', 2)
    inv.add('fish', 3)
    const claimed = claimFoodItems(inv, 4)
    const total = claimed.reduce((n, c) => n + c.amount, 0)
    expect(total).toBe(4)
    expect(foodItemCount(inv)).toBe(1)
  })

  it('claims at most what is actually held, never more', () => {
    const inv = new Inventory()
    inv.add('carrot', 2)
    const claimed = claimFoodItems(inv, 10)
    expect(claimed.reduce((n, c) => n + c.amount, 0)).toBe(2)
    expect(foodItemCount(inv)).toBe(0)
  })
})

describe('depositFoodItems', () => {
  it('adds every claimed kind/amount back into the target inventory', () => {
    const source = new Inventory()
    source.add('carrot', 2)
    source.add('fish', 1)
    const claimed = claimFoodItems(source, 3)
    const destination = new Inventory()
    depositFoodItems(destination, claimed)
    expect(foodItemCount(destination)).toBe(3)
  })

  it('preserves the claimed batch acquiredAtDays instead of resetting freshness to day 0', () => {
    const source = new Inventory()
    source.add('fish', 2, 4)
    const claimed = claimFoodItems(source, 2)
    const destination = new Inventory()
    depositFoodItems(destination, claimed)
    expect(destination.getFoodBatches('fish')).toEqual([{ count: 2, acquiredAtDays: 4 }])
  })
})

describe('carryFoodClaim / deliverCarriedFoodClaim', () => {
  it('moves a claim into the carrier and on to the destination, freshness intact', () => {
    const source = new Inventory()
    source.add('fish', 3, 2)
    const carrier = new Inventory()
    const destination = new Inventory()

    const claimed = claimFoodItems(source, 3)
    const carried = carryFoodClaim(carrier, claimed, source)
    expect(foodItemCount(carrier)).toBe(3)
    expect(foodItemCount(source)).toBe(0)

    deliverCarriedFoodClaim(carrier, carried, destination)
    expect(foodItemCount(carrier)).toBe(0)
    expect(foodItemCount(destination)).toBe(3)
    expect(destination.getFoodBatches('fish')).toEqual([{ count: 3, acquiredAtDays: 2 }])
  })

  it('refunds whatever does not fit in the carrier straight back to the source', () => {
    const source = new Inventory()
    source.add('fish', 3)
    const tinyCarrier = new Inventory(undefined, 0.01)

    const claimed = claimFoodItems(source, 3)
    const carried = carryFoodClaim(tinyCarrier, claimed, source)
    expect(carried).toEqual([])
    expect(foodItemCount(tinyCarrier)).toBe(0)
    expect(foodItemCount(source)).toBe(3)
  })
})
