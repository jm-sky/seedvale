import { describe, expect, it } from 'vitest'
import { createFoodBatch } from '../items/foodFreshness'
import { Inventory } from '../items/Inventory'
import {
  createLiquidContainerInstance,
  fillLiquidContainer,
} from '../items/liquidContainer'
import { createHousehold } from '../settlement/household'
import {
  contractProvisionFeasibilityPenalty,
  countPersonalDrinkPortions,
  countPersonalFood,
  estimateContractProvisionNeed,
  findDrinkablePersonalWaterContainer,
  provisionContractSupplies,
  readContractProvisionAvailability,
} from './npcPersonalProvisions'

describe('npcPersonalProvisions helpers', () => {
  it('counts personal food and drink portions deterministically', () => {
    const inventory = new Inventory()
    inventory.add('bread', 2)
    const filled = fillLiquidContainer(createLiquidContainerInstance('waterskin_small'), 'water')!
    inventory.addInstance(filled)
    expect(countPersonalFood(inventory)).toBe(2)
    expect(countPersonalDrinkPortions(inventory)).toBe(2)
    expect(findDrinkablePersonalWaterContainer(inventory)?.id).toBe(filled.id)
  })

  it('skips provisioning estimates for short local contracts', () => {
    const estimate = estimateContractProvisionNeed({
      travelHours: 1,
      workHours: 2,
      hunger: 0.2,
      thirst: 0.2,
    })
    expect(estimate.skipProvisioning).toBe(true)
    expect(estimate.foodUnitsNeeded).toBe(0)
    expect(estimate.drinkPortionsNeeded).toBe(0)
  })

  it('requests more units for longer remote work', () => {
    const estimate = estimateContractProvisionNeed({
      travelHours: 4,
      workHours: 8,
      hunger: 0.4,
      thirst: 0.4,
    })
    expect(estimate.skipProvisioning).toBe(false)
    expect(estimate.foodUnitsNeeded).toBeGreaterThan(0)
    expect(estimate.drinkPortionsNeeded).toBeGreaterThan(0)
  })
})

describe('provisionContractSupplies', () => {
  it('transfers household food into personal inventory with freshness intact', () => {
    const household = createHousehold('hh:1', 'settlement:1', 'home:1')
    household.items.addWithFreshness('bread', 2, [createFoodBatch(2, 1, 1)], 1)
    const personal = new Inventory()
    const startingFood = household.foodCount()
    const estimate = estimateContractProvisionNeed({
      travelHours: 5,
      workHours: 6,
      hunger: 0.3,
      thirst: 0.3,
    })
    const availability = readContractProvisionAvailability(personal, household)
    const result = provisionContractSupplies({
      personalInventory: personal,
      household,
      estimate,
      availability,
      nowDays: 2,
    })
    expect(result.foodProvisioned).toBeGreaterThan(0)
    expect(personal.count('bread')).toBe(result.foodProvisioned)
    expect(household.foodCount()).toBe(startingFood - result.foodProvisioned)
  })

  it('does not destroy household food when personal inventory has no room', () => {
    const household = createHousehold('hh:2', 'settlement:1', 'home:2')
    household.items.add('bread', 3)
    const personal = new Inventory(undefined, 0.1)
    const startingFood = household.foodCount()
    const estimate = {
      ...estimateContractProvisionNeed({
        travelHours: 5,
        workHours: 6,
        hunger: 0.3,
        thirst: 0.1,
      }),
      drinkPortionsNeeded: 0,
      foodUnitsNeeded: 2,
      skipProvisioning: false,
    }
    const availability = readContractProvisionAvailability(personal, household)
    const result = provisionContractSupplies({
      personalInventory: personal,
      household,
      estimate,
      availability,
      nowDays: 0,
    })
    expect(result.foodProvisioned).toBe(0)
    expect(result.failureReason).toBe('insufficientPersonalFood')
    expect(household.foodCount()).toBe(startingFood)
  })

  it('fills an owned waterskin from household water without minting a new one', () => {
    const household = createHousehold('hh:3', 'settlement:1', 'home:3')
    const personal = new Inventory()
    personal.addInstance(createLiquidContainerInstance('waterskin_small'))
    const beforeWater = household.water.current
    const estimate = estimateContractProvisionNeed({
      travelHours: 5,
      workHours: 6,
      hunger: 0.1,
      thirst: 0.5,
    })
    const availability = readContractProvisionAvailability(personal, household)
    const result = provisionContractSupplies({
      personalInventory: personal,
      household,
      estimate,
      availability,
      nowDays: 0,
    })
    expect(result.drinksAdded).toBeGreaterThan(0)
    expect(countPersonalDrinkPortions(personal)).toBeGreaterThan(0)
    expect(household.water.current).toBeLessThan(beforeWater)
  })
})

describe('contractProvisionFeasibilityPenalty', () => {
  it('hard-rejects clearly impossible remote assignments', () => {
    const estimate = estimateContractProvisionNeed({
      travelHours: 8,
      workHours: 10,
      hunger: 0.7,
      thirst: 0.7,
    })
    const penalty = contractProvisionFeasibilityPenalty(estimate, {
      personalFoodUnits: 0,
      personalDrinkPortions: 0,
      householdFoodUnits: 0,
      householdWaterUnits: 0,
      canFillWaterskin: false,
    })
    expect(penalty).toBe(Number.POSITIVE_INFINITY)
  })
})
