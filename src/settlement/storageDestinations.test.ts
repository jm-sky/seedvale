import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import {
  classifyItemStorageKind,
  householdStorageDestination,
  resolveHouseholdWoodStorage,
  settlementStorageDestination,
} from './storageDestinations'

describe('classifyItemStorageKind', () => {
  it('classifies every existing food ItemKind as food', () => {
    for (const kind of FOOD_ITEM_KINDS) expect(classifyItemStorageKind(kind)).toBe('food')
  })

  it('does not classify non-food items as a storage kind', () => {
    expect(classifyItemStorageKind('arrow')).toBeNull()
    expect(classifyItemStorageKind('hide')).toBeNull()
    expect(classifyItemStorageKind('stone')).toBeNull()
  })

  it('is deterministic', () => {
    expect(classifyItemStorageKind('carrot')).toBe(classifyItemStorageKind('carrot'))
  })
})

describe('householdStorageDestination', () => {
  const home = new Vector3(1, 0, 1)
  const householdWood = new Vector3(3, 0, 4)

  it('resolves food to the household home', () => {
    expect(householdStorageDestination('food', home, householdWood)).toBe(home)
  })

  it('resolves wood to the household wood storage point, never home or settlement stockpile', () => {
    expect(householdStorageDestination('wood', home, householdWood)).toBe(householdWood)
    expect(householdStorageDestination('wood', home, householdWood)).not.toBe(home)
  })

  it('never sends food to the wood destination or vice versa', () => {
    expect(householdStorageDestination('food', home, householdWood)).not.toBe(householdWood)
    expect(householdStorageDestination('wood', home, householdWood)).not.toBe(home)
  })
})

describe('resolveHouseholdWoodStorage', () => {
  const homeA = new Vector3(1, 0, 1)
  const homeB = new Vector3(9, 0, 9)
  const woodA = new Vector3(2, 0, 2)
  const woodB = new Vector3(10, 0, 8)

  it('returns the index-aligned household wood landmark for each home', () => {
    const landmarks = {
      homes: [homeA, homeB],
      householdWoodStorages: [woodA, woodB],
    }
    expect(resolveHouseholdWoodStorage(homeA, landmarks)).toBe(woodA)
    expect(resolveHouseholdWoodStorage(homeB, landmarks)).toBe(woodB)
  })

  it('falls back to home when no wood landmark exists for that index', () => {
    const landmarks = { homes: [homeA], householdWoodStorages: [] as Vector3[] }
    expect(resolveHouseholdWoodStorage(homeA, landmarks)).toBe(homeA)
  })
})

describe('settlementStorageDestination', () => {
  const stockpile = new Vector3(9, 0, 9)
  const settlementStorage = new Vector3(11, 0, 10)

  it('resolves food to the settlement storage crate', () => {
    expect(settlementStorageDestination('food', stockpile, settlementStorage)).toBe(settlementStorage)
  })

  it('resolves wood to the settlement stockpile', () => {
    expect(settlementStorageDestination('wood', stockpile, settlementStorage)).toBe(stockpile)
  })

  it('never sends food to the wood destination or vice versa', () => {
    expect(settlementStorageDestination('food', stockpile, settlementStorage)).not.toBe(stockpile)
    expect(settlementStorageDestination('wood', stockpile, settlementStorage)).not.toBe(settlementStorage)
  })

  it('is deterministic for the same inputs', () => {
    expect(settlementStorageDestination('food', stockpile, settlementStorage))
      .toBe(settlementStorageDestination('food', stockpile, settlementStorage))
  })
})
