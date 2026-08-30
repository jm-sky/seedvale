import { describe, expect, it } from 'vitest'
import { claimFoodItems } from '../items/foodItems'
import { createHousehold } from '../settlement/household'
import { claimEconomySurplus, claimHouseholdSurplus } from './localExchange'
import { createSettlementEconomy } from './settlementEconomy'

function zeroedHousehold() {
  const household = createHousehold('h', 's', 'home')
  household.items.remove('bread', household.items.count('bread'))
  household.stock.remove('wood', household.stock.query('wood'))
  return household
}

/** `claimHouseholdSurplus`/`claimEconomySurplus` operate on `EconomicStock`,
 *  so plan settlements-npcs-008 keeps them wood-only in practice — a
 *  household/settlement economy never stores food in `stock` any more (see
 *  `SettlementEconomy.withdrawFood`/`Household.depositFood` below for the
 *  concrete-food equivalent). */
describe('claimHouseholdSurplus (wood — plan settlements-npcs-005)', () => {
  it('claims exactly the requested amount when surplus covers it', () => {
    const household = zeroedHousehold()
    household.deposit('wood', 7) // target 3, capacity 5 -> surplus 2
    expect(claimHouseholdSurplus(household, 'wood', 2)).toBe(2)
    expect(household.stock.query('wood')).toBe(3)
  })

  it('caps the claim at the current surplus when it is less than requested', () => {
    const household = zeroedHousehold()
    household.deposit('wood', 5) // target 3 -> surplus 2
    expect(claimHouseholdSurplus(household, 'wood', 10)).toBe(2)
    expect(household.stock.query('wood')).toBe(3)
  })

  it('claims nothing and leaves stock untouched when there is no surplus', () => {
    const household = zeroedHousehold()
    household.deposit('wood', 1) // below target -> surplus 0
    expect(claimHouseholdSurplus(household, 'wood', 5)).toBe(0)
    expect(household.stock.query('wood')).toBe(1)
  })

  it('never removes more than it reports claiming (conservation)', () => {
    const household = zeroedHousehold()
    household.deposit('wood', 8) // target 3 -> surplus 5
    const before = household.stock.query('wood')
    const claimed = claimHouseholdSurplus(household, 'wood', 4)
    expect(household.stock.query('wood')).toBe(before - claimed)
  })

  it('never claims food — a household no longer stores food in stock', () => {
    const household = zeroedHousehold()
    household.depositFood('carrot', 5) // within the food capacity (7)
    expect(claimHouseholdSurplus(household, 'food', 3)).toBe(0)
    expect(household.foodCount()).toBe(5)
  })
})

describe('claimEconomySurplus (wood — plan settlements-npcs-005)', () => {
  it('claims exactly the requested amount when surplus covers it', () => {
    const economy = createSettlementEconomy('s1', { wood: 20 }, [{ kind: 'wood', target: 10 }])
    expect(claimEconomySurplus(economy, 'wood', 5)).toBe(5)
    expect(economy.query('wood')).toBe(15)
  })

  it('caps the claim at the current surplus', () => {
    const economy = createSettlementEconomy('s1', { wood: 12 }, [{ kind: 'wood', target: 10 }])
    expect(claimEconomySurplus(economy, 'wood', 100)).toBe(2)
    expect(economy.query('wood')).toBe(10)
  })

  it('claims nothing when there is no surplus', () => {
    const economy = createSettlementEconomy('s1', { wood: 5 }, [{ kind: 'wood', target: 10 }])
    expect(claimEconomySurplus(economy, 'wood', 5)).toBe(0)
    expect(economy.query('wood')).toBe(5)
  })

  it('never claims food — add/remove no-op for the food EconomicKind', () => {
    const economy = createSettlementEconomy('s1', {}, [{ kind: 'food', target: 10 }])
    economy.depositFood('carrot', 20)
    expect(claimEconomySurplus(economy, 'food', 5)).toBe(0)
    expect(economy.query('food')).toBe(20)
  })
})

/** Concrete-food claim/deposit (plan settlements-npcs-008) — the item-level
 *  counterpart of `claimHouseholdSurplus`/`claimEconomySurplus` above, used
 *  by `NpcAgent`'s food branch of `beginEconomyWithdraw`/
 *  `beginHouseholdExchange`/`beginTraderWork`. */
describe('SettlementEconomy.withdrawFood / depositFood', () => {
  it('deposits land as real concrete items, not a scalar', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('fish', 3)
    economy.depositFood('carrot', 2)
    expect(economy.items.count('fish')).toBe(3)
    expect(economy.items.count('carrot')).toBe(2)
    expect(economy.query('food')).toBe(5)
  })

  it('withdrawFood claims up to amount across kinds, deterministic order', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('carrot', 2)
    economy.depositFood('fish', 2)
    const claimed = economy.withdrawFood(3)
    const total = claimed.reduce((n, c) => n + c.amount, 0)
    expect(total).toBe(3)
    expect(economy.query('food')).toBe(1)
  })

  it('withdrawFood never claims more than is actually held', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('carrot', 2)
    const claimed = economy.withdrawFood(10)
    expect(claimed.reduce((n, c) => n + c.amount, 0)).toBe(2)
    expect(economy.query('food')).toBe(0)
  })
})

describe('claimFoodItems (items/foodItems.ts)', () => {
  it('claims from a household Inventory the same way, across mixed kinds', () => {
    const household = zeroedHousehold()
    household.depositFood('carrot', 2)
    household.depositFood('fish', 2)
    const claimed = claimFoodItems(household.items, 3)
    expect(claimed.reduce((n, c) => n + c.amount, 0)).toBe(3)
    expect(household.foodCount()).toBe(1)
  })
})
