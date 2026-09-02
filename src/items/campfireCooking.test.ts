import { describe, expect, it } from 'vitest'
import type { VillageFire } from '../settlement/VillageFire'
import { findCookingBatch, findCookingRecipe, resolveCookingCapacity } from './campfireCooking'
import { Inventory } from './Inventory'

/** Minimal `VillageFire` stub — cooking capacity only ever reads `hasGrate()`
 *  (plan 175), so nothing else here needs to be real. */
function fakeFire(hasGrate: boolean): VillageFire {
  return {
    position: { x: 0, y: 0, z: 0 } as VillageFire['position'],
    isLit: () => true,
    isIgniting: () => false,
    getIgniteProgress: () => 1,
    light: () => {},
    addFuel: () => {},
    hasGrate: () => hasGrate,
    setGrate: () => {},
    update: () => {},
  }
}

describe('resolveCookingCapacity (plan 175)', () => {
  it('is 1 for a bare fire with no pan', () => {
    const inv = new Inventory()
    expect(resolveCookingCapacity(fakeFire(false), inv)).toBe(1)
  })

  it('is 2 with a carried pan', () => {
    const inv = new Inventory()
    inv.add('pan', 1)
    expect(resolveCookingCapacity(fakeFire(false), inv)).toBe(2)
  })

  it('is 4 once the fire has a grate', () => {
    const inv = new Inventory()
    expect(resolveCookingCapacity(fakeFire(true), inv)).toBe(4)
  })

  it('grate wins outright — pan + grate is 4, never 6', () => {
    const inv = new Inventory()
    inv.add('pan', 1)
    expect(resolveCookingCapacity(fakeFire(true), inv)).toBe(4)
  })
})

describe('findCookingBatch (plan 175)', () => {
  it('returns null with no cookable input', () => {
    const inv = new Inventory()
    expect(findCookingBatch(inv, 4)).toBeNull()
  })

  it('clamps the batch to capacity even with more input available', () => {
    const inv = new Inventory()
    inv.add('raw_meat', 4)
    const batch = findCookingBatch(inv, 2)
    expect(batch).not.toBeNull()
    expect(batch!.batch).toBe(2)
    expect(batch!.recipe.output).toBe('roasted_meat')
  })

  it('clamps the batch to what is actually carried, under capacity', () => {
    const inv = new Inventory()
    inv.add('raw_meat', 1)
    const batch = findCookingBatch(inv, 4)
    expect(batch?.batch).toBe(1)
  })

  it('still finds any of the species-meat inputs, not only raw_meat', () => {
    const inv = new Inventory()
    inv.add('boar_meat', 3)
    const batch = findCookingBatch(inv, 4)
    expect(batch?.recipe.input).toBe('boar_meat')
    expect(batch?.batch).toBe(3)
  })
})

describe('findCookingRecipe (plan 106, unchanged)', () => {
  it('still finds nothing with an empty inventory', () => {
    expect(findCookingRecipe(new Inventory())).toBeNull()
  })
})

describe('fish cooking (plan items-player-012)', () => {
  it('cooks fish to a distinct roasted_fish output, never roasted_meat', () => {
    const inv = new Inventory()
    inv.add('fish', 2)
    const batch = findCookingBatch(inv, 4)
    expect(batch).not.toBeNull()
    expect(batch!.recipe.output).toBe('roasted_fish')
    expect(batch!.recipe.output).not.toBe('roasted_meat')
    expect(batch!.batch).toBe(2)
  })

  it('prefers meat over fish when both are carried (first matching recipe row)', () => {
    const inv = new Inventory()
    inv.add('fish', 3)
    inv.add('raw_meat', 1)
    const batch = findCookingBatch(inv, 4)
    expect(batch?.recipe.output).toBe('roasted_meat')
  })
})
