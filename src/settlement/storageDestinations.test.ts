import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FOOD_ITEM_KINDS } from '../items/foodItems'
import {
  classifyItemStorageKind,
  householdStorageDestination,
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
  const stockpile = new Vector3(9, 0, 9)

  it('resolves food to the household home', () => {
    expect(householdStorageDestination('food', home, stockpile)).toBe(home)
  })

  it('resolves wood to the shared stockpile, never home', () => {
    expect(householdStorageDestination('wood', home, stockpile)).toBe(stockpile)
  })

  it('never sends food to the wood destination or vice versa', () => {
    expect(householdStorageDestination('food', home, stockpile)).not.toBe(stockpile)
    expect(householdStorageDestination('wood', home, stockpile)).not.toBe(home)
  })
})

describe('settlementStorageDestination', () => {
  const stockpile = new Vector3(9, 0, 9)
  const settlementStorage = new Vector3(11, 0, 10)

  it('resolves food to the settlement storage crate', () => {
    expect(settlementStorageDestination('food', stockpile, settlementStorage)).toBe(settlementStorage)
  })

  it('resolves wood to the shared stockpile', () => {
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
