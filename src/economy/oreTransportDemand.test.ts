import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createTransportOrders } from '../world/createTransportOrders'
import {
  committedIncomingOre,
  committedOutgoingOre,
  creditDeliveredOreToStock,
  sourcedDeliveryProvenance,
  uncommittedResourceSiteOre,
  uncoveredOreProductionNeed,
} from './oreTransportDemand'
import { BLACKSMITH_IRON_ROD_PRODUCTION } from './production'
import { createSettlementEconomy } from './settlementEconomy'

const source = { type: 'resource-site' as const, resourceId: 'resource_1_2' }
const destination = { type: 'settlement-storage' as const, settlementId: 's' }

function economyWithIronShortage() {
  const economy = createSettlementEconomy('s', { iron: 0, coal: 1 }, [])
  economy.observeProductionOutcome({
    ok: false,
    recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
    reason: 'insufficient-input',
    category: 'stock',
    kind: 'iron',
  }, 0)
  return economy
}

describe('ore transport demand (settlements-npcs-021)', () => {
  it('creates no uncovered need without a stock production shortage', () => {
    const economy = createSettlementEconomy('s', { iron: 0, coal: 0 }, [])
    expect(uncoveredOreProductionNeed(economy, [])).toBeNull()
  })

  it('treats an iron stock shortage as uncovered when nothing is incoming', () => {
    const economy = economyWithIronShortage()
    expect(uncoveredOreProductionNeed(economy, [])).toEqual({ kind: 'iron', quantity: 3 })
  })

  it('subtracts incoming assigned and in-transit ore of the same kind', () => {
    const economy = economyWithIronShortage()
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 1, carrierNpcId: 'npc:a',
    })
    expect(committedIncomingOre(orders.list(), 's', 'iron')).toBe(1)
    expect(uncoveredOreProductionNeed(economy, orders.list())).toBeNull()
  })

  it('ignores terminal, food, and other-settlement orders', () => {
    const economy = economyWithIronShortage()
    const orders = createTransportOrders()
    const failed = orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 2, carrierNpcId: 'npc:a',
    })!
    orders.fail(failed.id)
    orders.create({
      source: { type: 'household', householdId: 'h' },
      destination,
      itemKind: 'carrot',
      requestedQuantity: 4,
      carrierNpcId: 'npc:b',
    })
    orders.create({
      source,
      destination: { type: 'settlement-storage', settlementId: 'other' },
      itemKind: 'iron',
      requestedQuantity: 2,
      carrierNpcId: 'npc:c',
    })
    expect(committedIncomingOre(orders.list(), 's')).toBe(0)
    expect(uncoveredOreProductionNeed(economy, orders.list())?.kind).toBe('iron')
  })

  it('counts only pre-pickup outgoing against site supply', () => {
    const inventory = new Inventory()
    inventory.add('iron', 5)
    const orders = createTransportOrders()
    orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })
    expect(committedOutgoingOre(orders.list(), 'resource_1_2')).toBe(3)
    expect(uncommittedResourceSiteOre(inventory, orders.list(), 'resource_1_2', undefined, 'iron')).toBe(2)
  })

  it('stops counting a source commitment after pickup', () => {
    const inventory = new Inventory()
    inventory.add('iron', 5)
    const orders = createTransportOrders()
    const order = orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })!
    orders.completePickup(order.id, 'npc:a', 3)
    expect(committedOutgoingOre(orders.list(), 'resource_1_2')).toBe(0)
    expect(uncommittedResourceSiteOre(inventory, orders.list(), 'resource_1_2', undefined, 'iron')).toBe(5)
  })

  it('can exclude the caller\'s own order when revalidating pickup', () => {
    const inventory = new Inventory()
    inventory.add('iron', 5)
    const orders = createTransportOrders()
    const own = orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 3, carrierNpcId: 'npc:a',
    })!
    orders.create({
      source, destination, itemKind: 'iron', requestedQuantity: 1, carrierNpcId: 'npc:b',
    })
    expect(uncommittedResourceSiteOre(inventory, orders.list(), 'resource_1_2', own.id, 'iron')).toBe(4)
  })

  it('moves delivered ore from settlement items into bulk stock', () => {
    const economy = createSettlementEconomy('s', { iron: 0 }, [])
    economy.items.add('iron', 2)
    creditDeliveredOreToStock(economy, 'iron', 2, 4)
    expect(economy.items.count('iron')).toBe(0)
    expect(economy.query('iron')).toBe(2)
  })

  it('does not mint stock from a non-ore unload', () => {
    const economy = createSettlementEconomy('s', { iron: 0 }, [])
    economy.items.add('carrot', 2)
    creditDeliveredOreToStock(economy, 'carrot', 2, 0)
    expect(economy.items.count('carrot')).toBe(2)
    expect(economy.query('iron')).toBe(0)
  })

  describe('sourcedDeliveryProvenance (plan settlements-004)', () => {
    it('resolves provenance only for a resource-site source carrying an economicSourceId', () => {
      expect(sourcedDeliveryProvenance({
        id: 'transportOrder:1',
        source: { type: 'resource-site', resourceId: 'r1', economicSourceId: 'mine:a' },
      })).toEqual({ economicSourceId: 'mine:a', eventId: 'transportOrder:1' })
      expect(sourcedDeliveryProvenance({
        id: 'transportOrder:2',
        source: { type: 'resource-site', resourceId: 'r1' },
      })).toBeUndefined()
      expect(sourcedDeliveryProvenance({
        id: 'transportOrder:3',
        source: { type: 'household', householdId: 'h' },
      })).toBeUndefined()
    })
  })

  describe('attributed gold delivery (plan settlements-004)', () => {
    it('credits attributed stock and immediately realizes it into an entitlement-ready gross value', () => {
      const economy = createSettlementEconomy('s', { gold: 0 }, [])
      economy.items.add('gold', 3)
      const entitlement = economy.establishEntitlement({
        sourceId: 'mine:a', beneficiary: { kind: 'player' }, shareBps: 2000,
      })
      creditDeliveredOreToStock(economy, 'gold', 3, 6, { economicSourceId: 'mine:a', eventId: 'transportOrder:9' })
      expect(economy.items.count('gold')).toBe(0)
      // Realized immediately — gold has no other stock use (plan settlements-004).
      expect(economy.query('gold')).toBe(0)
      expect(economy.sourceUnrealized('mine:a', 'gold')).toBe(0)
      // tradeValue('gold') = 20, so 3 * 20 = 60 gross, 20% = 12.
      expect(economy.claimableEntitlement(entitlement.id)).toBe(12)
    })

    it('the same order id cannot realize the same delivery twice', () => {
      const economy = createSettlementEconomy('s', { gold: 0 }, [])
      economy.items.add('gold', 6)
      const provenance = { economicSourceId: 'mine:a', eventId: 'transportOrder:9' }
      creditDeliveredOreToStock(economy, 'gold', 3, 0, provenance)
      economy.items.add('gold', 3)
      creditDeliveredOreToStock(economy, 'gold', 3, 0, provenance)
      const realizations = economy.snapshot().sourceAccounting?.realizations ?? []
      expect(realizations).toHaveLength(1)
    })

    it('mined-but-not-delivered gold (no provenance) still uses plain add(), not attribution', () => {
      const economy = createSettlementEconomy('s', { gold: 0 }, [])
      economy.items.add('gold', 3)
      creditDeliveredOreToStock(economy, 'gold', 3, 0)
      expect(economy.query('gold')).toBe(3)
      expect(economy.sourceUnrealized('mine:a', 'gold')).toBe(0)
    })
  })
})
