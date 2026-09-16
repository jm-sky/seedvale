import { describe, expect, it } from 'vitest'
import { merchantPrice } from './tradeCatalog'
import { applyPurchaseMarkup, createTradeGrievanceStore, isTradeGrievanceList, UNAUTHORIZED_PROPERTY_USE_DURATION_DAYS } from './tradeGrievance'

describe('trade grievance (plan items-player-042)', () => {
  it('does not change list price at markup 0', () => {
    expect(applyPurchaseMarkup(8, 0)).toBe(8)
    expect(applyPurchaseMarkup(merchantPrice('bread')!, 0)).toBe(merchantPrice('bread'))
  })

  it('rounds marked-up purchase prices with the shared coin helper', () => {
    expect(applyPurchaseMarkup(8, 0.15)).toBe(9)
    expect(applyPurchaseMarkup(250, 0.10)).toBe(275)
  })

  it('returns no markup after expiry and prunes the row', () => {
    const store = createTradeGrievanceStore()
    store.applyUnauthorizedUse('home:npc:1', 0.15, 2)
    expect(store.markupFor('home:npc:1', 3.9)).toBe(0.15)
    expect(store.markupFor('home:npc:1', 4)).toBe(0)
    expect(store.serialize()).toEqual([])
  })

  it('refreshes with max markup and max expiry instead of stacking', () => {
    const store = createTradeGrievanceStore()
    store.applyUnauthorizedUse('home:npc:1', 0.10, 1)
    store.applyUnauthorizedUse('home:npc:1', 0.25, 2)
    expect(store.markupFor('home:npc:1', 2)).toBe(0.25)
    expect(store.serialize()[0]?.expiresAtElapsedDays).toBe(2 + UNAUTHORIZED_PROPERTY_USE_DURATION_DAYS)
  })

  it('round-trips serialized grievances and ignores other merchants', () => {
    const store = createTradeGrievanceStore()
    store.applyUnauthorizedUse('home:npc:1', 0.15, 5)
    const restored = createTradeGrievanceStore(store.serialize())
    expect(restored.markupFor('home:npc:1', 6)).toBe(0.15)
    expect(restored.markupFor('home:npc:2', 6)).toBe(0)
    expect(isTradeGrievanceList(store.serialize())).toBe(true)
    expect(isTradeGrievanceList([{ reason: 'gossip', merchantKey: 'x', markup: 1, expiresAtElapsedDays: 1 }])).toBe(false)
  })
})
