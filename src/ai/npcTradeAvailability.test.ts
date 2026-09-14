import { describe, expect, it } from 'vitest'
import { createHousehold, type Household } from '../settlement/household'
import { HUNT_RESUPPLY_ARROW_TARGET } from './NpcAgent'
import { npcTradeQuantityAvailable, resolveNpcTradeOffers, type TradeReserveNpc } from './npcTradeAvailability'

function hunter(household: Household): TradeReserveNpc {
  return { household, role: 'hunter' }
}
function farmer(household: Household): TradeReserveNpc {
  return { household, role: 'farmer' }
}

describe('npcTradeAvailability (plan settlements-npcs-033)', () => {
  it('offers nothing for an ordinary NPC without eligible stock', () => {
    const household = createHousehold('h1', 's1', 'home1', { water: 0, items: { counts: {}, instances: [] } })
    expect(resolveNpcTradeOffers(household, [])).toEqual([])
  })

  it('exposes only the excess above the hunter reserve', () => {
    const household = createHousehold('h2', 's1', 'home1', { water: 0, items: { counts: { arrow: 31 }, instances: [] } })
    const settlementNpcs = [hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', household, settlementNpcs)).toBe(31 - HUNT_RESUPPLY_ARROW_TARGET)
    expect(resolveNpcTradeOffers(household, settlementNpcs)).toEqual([
      { kind: 'arrow', quantity: 31 - HUNT_RESUPPLY_ARROW_TARGET },
    ])
  })

  it('is unavailable exactly at the reserve threshold', () => {
    const household = createHousehold('h3', 's1', 'home1', {
      water: 0,
      items: { counts: { arrow: HUNT_RESUPPLY_ARROW_TARGET }, instances: [] },
    })
    const settlementNpcs = [hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', household, settlementNpcs)).toBe(0)
    expect(resolveNpcTradeOffers(household, settlementNpcs)).toEqual([])
  })

  it('scales the reserve with the number of hunters sharing the household', () => {
    const household = createHousehold('h4', 's1', 'home1', {
      water: 0,
      items: { counts: { arrow: HUNT_RESUPPLY_ARROW_TARGET * 2 + 5 }, instances: [] },
    })
    const settlementNpcs = [hunter(household), hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', household, settlementNpcs)).toBe(5)
  })

  it('protects nothing when the household has no hunter — the full stock is offered', () => {
    const household = createHousehold('h5', 's1', 'home1', { water: 0, items: { counts: { arrow: 4 }, instances: [] } })
    const settlementNpcs = [farmer(household)]
    expect(npcTradeQuantityAvailable('arrow', household, settlementNpcs)).toBe(4)
  })

  it('never exposes an ineligible ItemKind even at a large owned quantity', () => {
    const household = createHousehold('h6', 's1', 'home1', { water: 0, items: { counts: { branch: 999, bandage: 20 }, instances: [] } })
    expect(resolveNpcTradeOffers(household, [])).toEqual([])
    expect(npcTradeQuantityAvailable('branch', household, [])).toBe(0)
    expect(npcTradeQuantityAvailable('bandage', household, [])).toBe(0)
  })
})
