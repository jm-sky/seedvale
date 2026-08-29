import { describe, expect, it } from 'vitest'
import {
  getFoodStrategyCandidates,
  getWaterDutyStrategyCandidates,
  getWaterStrategyCandidates,
  getWoodStrategyCandidates,
  selectStrategy,
} from './npcStrategies'

describe('getFoodStrategyCandidates', () => {
  it('omits the hunt candidate entirely for a non-hunter', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: true,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates.some((c) => c.id === 'hunt')).toBe(false)
  })

  it('includes hunt for a hunter, available only when a target exists', () => {
    const noTarget = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: true,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    const withTarget = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: true,
      huntTargetAvailable: true,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(noTarget.find((c) => c.id === 'hunt')?.available).toBe(false)
    expect(withTarget.find((c) => c.id === 'hunt')?.available).toBe(true)
  })

  it('marks householdFood unavailable when the household has no food', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates.find((c) => c.id === 'householdFood')?.available).toBe(false)
  })

  it('marks nearbyFoodSource available only when a target exists', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: true,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates.find((c) => c.id === 'nearbyFoodSource')?.available).toBe(true)
  })

  it('always keeps gardenGather available as the unconditional fallback', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: true,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates.find((c) => c.id === 'gardenGather')?.available).toBe(true)
  })

  it('is deterministic for identical inputs', () => {
    const ctx = {
      householdHasFood: true,
      isHunter: true,
      huntTargetAvailable: true,
      nearbyFoodSourceAvailable: true,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    }
    expect(getFoodStrategyCandidates(ctx)).toEqual(getFoodStrategyCandidates(ctx))
  })

  it('places economyWithdraw and householdExchange between householdFood and hunt/foraging', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: true,
      huntTargetAvailable: true,
      nearbyFoodSourceAvailable: true,
      deliveryAvailable: false,
      economyWithdrawAvailable: true,
      householdExchangeAvailable: true,
    })
    expect(candidates.map((c) => c.id)).toEqual([
      'householdFood',
      'economyWithdraw',
      'householdExchange',
      'hunt',
      'nearbyFoodSource',
      'gardenGather',
    ])
    expect(selectStrategy(candidates)).toBe('economyWithdraw')
  })

  it('falls through to householdExchange when economyWithdraw is unavailable', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: true,
    })
    expect(selectStrategy(candidates)).toBe('householdExchange')
  })

  it('omits playerStorageDelivery when unavailable', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: true,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates.some((c) => c.id === 'playerStorageDelivery')).toBe(false)
  })

  it('lists playerStorageDelivery first, ahead of householdFood, when available', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: true,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: true,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(candidates[0]).toEqual({ id: 'playerStorageDelivery', available: true })
    expect(selectStrategy(candidates)).toBe('playerStorageDelivery')
  })
})

describe('selectStrategy', () => {
  it('selects the single available strategy unchanged', () => {
    expect(selectStrategy([{ id: 'chopDeposit', available: true }])).toBe('chopDeposit')
  })

  it('rejects unavailable strategies before selection, preferring the first available one', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: true,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(selectStrategy(candidates)).toBe('nearbyFoodSource')
  })

  it('prefers householdFood over every other strategy when available', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: true,
      isHunter: true,
      huntTargetAvailable: true,
      nearbyFoodSourceAvailable: true,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(selectStrategy(candidates)).toBe('householdFood')
  })

  it('falls through to gardenGather when nothing else is available', () => {
    const candidates = getFoodStrategyCandidates({
      householdHasFood: false,
      isHunter: false,
      huntTargetAvailable: false,
      nearbyFoodSourceAvailable: false,
      deliveryAvailable: false,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: false,
    })
    expect(selectStrategy(candidates)).toBe('gardenGather')
  })

  it('returns null when every candidate is unavailable', () => {
    expect(selectStrategy([{ id: 'chopDeposit', available: false }])).toBeNull()
  })
})

describe('getWaterStrategyCandidates', () => {
  it('prefers householdWater when available, well otherwise', () => {
    expect(selectStrategy(getWaterStrategyCandidates({ householdHasWater: true }))).toBe('householdWater')
    expect(selectStrategy(getWaterStrategyCandidates({ householdHasWater: false }))).toBe('well')
  })
})

describe('getWaterDutyStrategyCandidates', () => {
  it('has a single always-available fetchDeposit route', () => {
    expect(getWaterDutyStrategyCandidates()).toEqual([{ id: 'fetchDeposit', available: true }])
  })
})

describe('getWoodStrategyCandidates', () => {
  it('reflects the caller-computed availability of the chop route', () => {
    const noExchange = { economyWithdrawAvailable: false, householdExchangeAvailable: false }
    expect(selectStrategy(getWoodStrategyCandidates({ available: true, ...noExchange }))).toBe('chopDeposit')
    expect(selectStrategy(getWoodStrategyCandidates({ available: false, ...noExchange }))).toBeNull()
  })

  it('prefers economyWithdraw, then householdExchange, over chopping a tree', () => {
    expect(selectStrategy(getWoodStrategyCandidates({
      available: true,
      economyWithdrawAvailable: true,
      householdExchangeAvailable: true,
    }))).toBe('economyWithdraw')
    expect(selectStrategy(getWoodStrategyCandidates({
      available: true,
      economyWithdrawAvailable: false,
      householdExchangeAvailable: true,
    }))).toBe('householdExchange')
  })
})
