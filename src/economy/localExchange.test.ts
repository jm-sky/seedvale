import { describe, expect, it } from 'vitest'
import { createHousehold } from '../settlement/household'
import { claimEconomySurplus, claimHouseholdSurplus } from './localExchange'
import { createSettlementEconomy } from './settlementEconomy'

function zeroedHousehold() {
  const household = createHousehold('h', 's', 'home')
  household.stock.remove('food', household.stock.query('food'))
  household.stock.remove('wood', household.stock.query('wood'))
  return household
}

describe('claimHouseholdSurplus', () => {
  it('claims exactly the requested amount when surplus covers it', () => {
    const household = zeroedHousehold()
    household.deposit('food', 7) // target 3, capacity 7 -> surplus 4
    expect(claimHouseholdSurplus(household, 'food', 3)).toBe(3)
    expect(household.stock.query('food')).toBe(4)
  })

  it('caps the claim at the current surplus when it is less than requested', () => {
    const household = zeroedHousehold()
    household.deposit('food', 5) // target 3 -> surplus 2
    expect(claimHouseholdSurplus(household, 'food', 10)).toBe(2)
    expect(household.stock.query('food')).toBe(3)
  })

  it('claims nothing and leaves stock untouched when there is no surplus', () => {
    const household = zeroedHousehold()
    household.deposit('food', 1) // below target -> surplus 0
    expect(claimHouseholdSurplus(household, 'food', 5)).toBe(0)
    expect(household.stock.query('food')).toBe(1)
  })

  it('never removes more than it reports claiming (conservation)', () => {
    const household = zeroedHousehold()
    household.deposit('wood', 8) // target 3 -> surplus 5
    const before = household.stock.query('wood')
    const claimed = claimHouseholdSurplus(household, 'wood', 4)
    expect(household.stock.query('wood')).toBe(before - claimed)
  })
})

describe('claimEconomySurplus', () => {
  it('claims exactly the requested amount when surplus covers it', () => {
    const economy = createSettlementEconomy('s1', { food: 20 }, [{ kind: 'food', target: 10 }])
    expect(claimEconomySurplus(economy, 'food', 5)).toBe(5)
    expect(economy.query('food')).toBe(15)
  })

  it('caps the claim at the current surplus', () => {
    const economy = createSettlementEconomy('s1', { food: 12 }, [{ kind: 'food', target: 10 }])
    expect(claimEconomySurplus(economy, 'food', 100)).toBe(2)
    expect(economy.query('food')).toBe(10)
  })

  it('claims nothing when there is no surplus', () => {
    const economy = createSettlementEconomy('s1', { food: 5 }, [{ kind: 'food', target: 10 }])
    expect(claimEconomySurplus(economy, 'food', 5)).toBe(0)
    expect(economy.query('food')).toBe(5)
  })
})
