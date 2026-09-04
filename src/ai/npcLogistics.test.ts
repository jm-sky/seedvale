import { describe, expect, it } from 'vitest'
import type { NpcLogisticsCtx } from './npcLogistics'
import { createSettlementEconomy } from '../economy'
import { Inventory } from '../items/Inventory'
import { createHousehold } from '../settlement/household'
import { createNeedState } from './Needs'
import {
  canDeliverToPlayerStorage,
  canExchangeWithHousehold,
  canWithdrawFromEconomy,
  HELPER_DELIVERY_MAX_CARRY,
  planEconomyWithdraw,
  planHouseholdExchange,
  planPlayerStorageDelivery,
} from './npcLogistics'

const HOME = { x: 0, y: 0, z: 0 }
const LANDMARKS = {
  stockpile: { x: 5, y: 0, z: 0 },
  settlementStorage: { x: 6, y: 0, z: 0 },
} as unknown as NpcLogisticsCtx['landmarks']

function baseCtx(overrides: Partial<NpcLogisticsCtx> = {}): NpcLogisticsCtx {
  return {
    household: null,
    economy: null,
    householdExchange: null,
    helperDelivery: null,
    helperAssignment: null,
    needs: createNeedState(0),
    home: HOME,
    landmarks: LANDMARKS,
    carried: new Inventory(),
    waitMultiplier: 1,
    simTime: () => 0,
    sampleHeight: () => 0,
    ...overrides,
  }
}

/** Runs a two-leg `NpcPlannedAction` end to end: the pickup leg's
 *  `onComplete`, then the chained `next` deposit leg's `onComplete` — the
 *  same order `NpcAgent.startAction`'s `goTo` → `execute` → `next`
 *  promotion drives. */
function runTransfer(action: ReturnType<typeof planEconomyWithdraw>): void {
  if (!action) throw new Error('expected a planned action')
  action.onComplete()
  action.next?.onComplete()
}

describe('planEconomyWithdraw', () => {
  it('claims economy food surplus, carries it, and delivers it home', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('bread', 10)
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    const ctx = baseCtx({ household, economy })

    expect(canWithdrawFromEconomy(ctx, 'food')).toBe(true)
    const action = planEconomyWithdraw(ctx, 'food')
    expect(action).not.toBeNull()
    runTransfer(action)

    expect(household.items.count('bread')).toBeGreaterThan(0)
    expect(economy.items.count('bread')).toBeLessThan(10)
  })

  it('preserves food batches (freshness) across the claim → carry → deposit chain', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('bread', 4)
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    const ctx = baseCtx({ household, economy })

    const action = planEconomyWithdraw(ctx, 'food')
    runTransfer(action)

    // The household received real food, not merely a count bump with no
    // freshness tracking — deliverCarriedFoodClaim/carryFoodClaim round-trip
    // through addWithFreshness. HOUSEHOLD_EXCHANGE_MAX_TRANSFER caps the
    // trip at 3 of the economy's 4, and satisfyHouseholdResourceNeed then
    // eats one unit immediately (the NPC eats from what it just brought
    // home), leaving 2.
    expect(household.items.count('bread')).toBe(2)
    expect(economy.items.count('bread')).toBe(1)
  })

  it('uses the scalar claim seam for wood (claimEconomySurplus, not a food claim)', () => {
    const economy = createSettlementEconomy('s', { wood: 10 }, [{ kind: 'wood', target: 0 }])
    const household = createHousehold('h', 's', 'home:h', { stock: { wood: 0 }, water: 4 })
    const ctx = baseCtx({ household, economy })

    const action = planEconomyWithdraw(ctx, 'wood')
    expect(action).not.toBeNull()
    runTransfer(action)
    expect(household.stock.query('wood')).toBeGreaterThan(0)
  })

  it('a source with no real surplus yields no plan', () => {
    const economy = createSettlementEconomy('s', {}, [])
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    const ctx = baseCtx({ household, economy })

    expect(canWithdrawFromEconomy(ctx, 'food')).toBe(false)
    expect(planEconomyWithdraw(ctx, 'food')).toBeNull()
  })

  it('a claim consumed by another actor between plan-build and pickup yields nothing carried', () => {
    const economy = createSettlementEconomy('s', {}, [])
    economy.depositFood('bread', 2)
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    const ctx = baseCtx({ household, economy })

    const action = planEconomyWithdraw(ctx, 'food')
    expect(action).not.toBeNull()
    // Another actor drains the economy's food after the plan was built but
    // before the NPC arrives — the pickup leg must re-validate live state,
    // not the value read at plan-build time.
    economy.withdrawFood(economy.surplus('food'))
    runTransfer(action)
    expect(household.items.count('bread')).toBe(0)
  })

  it('returns null without a household or without an economy', () => {
    expect(planEconomyWithdraw(baseCtx({ economy: createSettlementEconomy('s', {}, []) }), 'food')).toBeNull()
    expect(planEconomyWithdraw(baseCtx({ household: createHousehold('h', 's', 'home:h') }), 'food')).toBeNull()
  })
})

describe('planHouseholdExchange', () => {
  function householdWithFood(id: string, amount: number) {
    const household = createHousehold(id, 's', `home:${id}`)
    household.items.remove('bread', household.items.count('bread'))
    if (amount > 0) household.depositFood('carrot', amount)
    return household
  }

  it('claims a neighbour household surplus and delivers it home', () => {
    const requester = householdWithFood('requester', 0)
    const source = householdWithFood('source', 20)
    const householdExchange = {
      findSurplusSource: () => ({ household: source, position: { x: 3, y: 0, z: 4 } }),
    }
    const ctx = baseCtx({ household: requester, householdExchange })

    expect(canExchangeWithHousehold(ctx, 'food')).toBe(true)
    const action = planHouseholdExchange(ctx, 'food')
    runTransfer(action)
    expect(requester.items.count('carrot')).toBeGreaterThan(0)
  })

  it('uses claimHouseholdSurplus (scalar) for wood', () => {
    const requester = createHousehold('requester', 's', 'home:requester', { stock: { wood: 0 }, water: 4 })
    const source = createHousehold('source', 's', 'home:source', { stock: { wood: 10 }, water: 4 })
    const householdExchange = {
      findSurplusSource: () => ({ household: source, position: { x: 1, y: 0, z: 1 } }),
    }
    const ctx = baseCtx({ household: requester, householdExchange })

    const action = planHouseholdExchange(ctx, 'wood')
    expect(action).not.toBeNull()
    runTransfer(action)
    expect(requester.stock.query('wood')).toBeGreaterThan(0)
  })

  it('a consumed source yields null (no exchange partner) once its surplus is gone', () => {
    const requester = householdWithFood('requester', 0)
    const source = householdWithFood('source', 20)
    source.items.remove('carrot', source.items.count('carrot'))
    const householdExchange = {
      findSurplusSource: () => null,
    }
    const ctx = baseCtx({ household: requester, householdExchange })
    expect(canExchangeWithHousehold(ctx, 'food')).toBe(false)
    expect(planHouseholdExchange(ctx, 'food')).toBeNull()
  })
})

describe('planPlayerStorageDelivery', () => {
  function deliveryCtx(overrides: Partial<NpcLogisticsCtx> = {}): NpcLogisticsCtx {
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    household.depositFood('carrot', 10)
    return baseCtx({
      household,
      helperAssignment: { enabled: true, resourceKind: 'food', targetContainerId: 'c1' },
      helperDelivery: {
        findTarget: () => ({ x: 2, y: 0, z: 2 }),
        hasRoom: () => true,
        deposit: (_id, _kind, amount) => amount,
      },
      ...overrides,
    })
  }

  it('gathers household surplus and delivers it into the target container', () => {
    const ctx = deliveryCtx()
    expect(canDeliverToPlayerStorage(ctx)).toBe(true)
    const action = planPlayerStorageDelivery(ctx)
    expect(action).not.toBeNull()
    expect(action?.kind).toBe('eat')
    runTransfer(action)
    expect(ctx.carried.count('bread')).toBe(0)
  })

  it('caps a single trip at HELPER_DELIVERY_MAX_CARRY', () => {
    const household = createHousehold('h', 's', 'home:h')
    household.items.remove('bread', household.items.count('bread'))
    household.depositFood('carrot', HELPER_DELIVERY_MAX_CARRY + 5)
    let deposited = 0
    const ctx = deliveryCtx({
      household,
      helperDelivery: {
        findTarget: () => ({ x: 2, y: 0, z: 2 }),
        hasRoom: () => true,
        deposit: (_id, _kind, amount) => {
          deposited = amount
          return amount
        },
      },
    })
    runTransfer(planPlayerStorageDelivery(ctx))
    expect(deposited).toBe(HELPER_DELIVERY_MAX_CARRY)
  })

  it('returns null when the assignment is disabled or there is no real surplus', () => {
    expect(planPlayerStorageDelivery(deliveryCtx({ helperAssignment: { enabled: false, resourceKind: 'food', targetContainerId: 'c1' } }))).toBeNull()
    const emptyHousehold = createHousehold('h2', 's', 'home:h2')
    emptyHousehold.items.remove('bread', emptyHousehold.items.count('bread'))
    expect(planPlayerStorageDelivery(deliveryCtx({ household: emptyHousehold }))).toBeNull()
  })

  it('own real hunger above the normal threshold blocks delivery even with surplus', () => {
    const needs = createNeedState(0)
    needs.hunger = 0.9
    expect(canDeliverToPlayerStorage(deliveryCtx({ needs }))).toBe(false)
  })
})
