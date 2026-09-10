import { describe, expect, it } from 'vitest'
import type { RelationLevel } from '../quests/quests'
import { NEUTRAL_REPUTATION } from '../reputation/ReputationManager'
import { Inventory } from './Inventory'
import { createTentInstance, isTentItemInstance } from './itemInstances'
import {
  previewPricedPurchaseNetCoins,
  previewTransactionNetCoins,
  resolveOfferLineBuyback,
  settlePricedPurchase,
  settleTransaction,
} from './trade'
import {
  BASE_SELL_FACTOR,
  BROKEN_SELL_MULTIPLIER,
  fullConditionSellFactor,
  MAX_SELL_FACTOR,
  MERCHANT_STOCK,
  merchantPrice,
  NEUTRAL_SELL_PRICE_CONTEXT,
  relationshipEffect,
  reputationEffect,
  resolveInstanceSellPrice,
  roundSellPrice,
  sellPrice,
  type SellPriceContext,
  tradeValue,
} from './tradeCatalog'
import { createTrapInstance } from './trapItemInstances'
import { createWeaponInstance } from './weaponMaintenance'

function makeContext(overrides: Partial<SellPriceContext> & { reputation?: Partial<SellPriceContext['reputation']> } = {}): SellPriceContext {
  return {
    relation: overrides.relation ?? NEUTRAL_SELL_PRICE_CONTEXT.relation,
    relationLevel: overrides.relationLevel ?? NEUTRAL_SELL_PRICE_CONTEXT.relationLevel,
    reputation: { ...NEUTRAL_REPUTATION, ...overrides.reputation },
    renown: overrides.renown ?? NEUTRAL_SELL_PRICE_CONTEXT.renown,
  }
}

describe('tradeCatalog (plan 090)', () => {
  it('lists every stocked item with a positive coin price', () => {
    expect(MERCHANT_STOCK.length).toBeGreaterThan(0)
    for (const kind of MERCHANT_STOCK) {
      const price = merchantPrice(kind)
      expect(price).toBeGreaterThan(0)
      expect(tradeValue(kind)).toBe(price)
    }
  })

  it('uses the plan 090 prices for sword, pickaxe and tent', () => {
    expect(merchantPrice('long_sword')).toBe(50)
    expect(merchantPrice('pickaxe')).toBe(30)
    expect(merchantPrice('tent')).toBe(30)
    expect(merchantPrice('sewing_kit')).toBe(18)
  })

  it('stocks plan-160 merchant weapons and leaves the rarest quest-only', () => {
    expect(merchantPrice('damascus_knife')).toBe(90)
    expect(merchantPrice('battle_axe')).toBe(110)
    expect(merchantPrice('damascus_long_sword')).toBeNull()
    expect(merchantPrice('obsidian_sword')).toBeNull()
    expect(tradeValue('obsidian_sword')).toBe(320)
  })

  it('does not sell raw materials', () => {
    expect(merchantPrice('stone')).toBeNull()
    expect(merchantPrice('branch')).toBeNull()
    expect(merchantPrice('iron')).toBeNull()
    expect(merchantPrice('shell')).toBeNull()
  })

  it('gives shells a barter value of 1', () => {
    expect(tradeValue('shell')).toBe(1)
  })
})

describe('merchant sell pricing (plan settlements-006)', () => {
  it('uses ~90% of trade value for a neutral stack item', () => {
    expect(sellPrice('knife')).toBe(10)
    expect(sellPrice('long_sword')).toBe(45)
  })

  it('keeps minimum 1 coin and refuses shell/coin', () => {
    expect(sellPrice('stone')).toBe(1)
    expect(sellPrice('shell')).toBeNull()
    expect(sellPrice('coin')).toBeNull()
  })

  it('maps positive relation tiers to 0/+1/+3/+5 pp', () => {
    const tiers: Array<[RelationLevel, number]> = [
      ['stranger', 0],
      ['acquainted', 0.01],
      ['friendly', 0.03],
      ['trusted', 0.05],
    ]
    for (const [relationLevel, expected] of tiers) {
      expect(relationshipEffect(makeContext({ relation: 99, relationLevel }))).toBe(expected)
    }
  })

  it('does not increase the positive relation bonus above trusted (+5 pp)', () => {
    expect(relationshipEffect(makeContext({ relation: 99, relationLevel: 'trusted' }))).toBe(0.05)
  })

  it('maps negative relation continuously down to -5 pp', () => {
    expect(relationshipEffect(makeContext({ relation: -3, relationLevel: 'stranger' }))).toBe(-0.03)
    expect(relationshipEffect(makeContext({ relation: -10, relationLevel: 'stranger' }))).toBe(-0.05)
  })

  it('weights trust/integrity/competence and ignores benevolence/courage', () => {
    const positive = makeContext({
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 0,
    })
    expect(reputationEffect(positive)).toBeCloseTo(0.05, 5)
    const negative = makeContext({
      reputation: { trust: -100, integrity: -100, competence: -100, benevolence: 100, courage: 100 },
      renown: 0,
    })
    expect(reputationEffect(negative)).toBeCloseTo(-0.05, 5)
  })

  it('uses renown only as an amplifier, not a standalone bonus', () => {
    expect(reputationEffect(makeContext({ renown: 100 }))).toBe(0)
  })

  it('amplifies both positive and negative reputation with high renown', () => {
    const good = makeContext({
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    const bad = makeContext({
      reputation: { trust: -100, integrity: -100, competence: -100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(reputationEffect(good)).toBeCloseTo(0.10, 5)
    expect(reputationEffect(bad)).toBeCloseTo(-0.10, 5)
  })

  it('caps full-condition pricing at ~105% and ~80%', () => {
    const best = makeContext({
      relation: 10,
      relationLevel: 'trusted',
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    const worst = makeContext({
      relation: -10,
      relationLevel: 'stranger',
      reputation: { trust: -100, integrity: -100, competence: -100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(fullConditionSellFactor(best)).toBeCloseTo(MAX_SELL_FACTOR, 5)
    expect(fullConditionSellFactor(worst)).toBeCloseTo(0.80, 5)
    expect(sellPrice('obsidian_sword', best)).toBe(roundSellPrice(tradeValue('obsidian_sword') * MAX_SELL_FACTOR))
    expect(sellPrice('long_sword', worst)).toBe(40)
  })

  it('caps stocked buyback at merchant list price to prevent buy/sell arbitrage', () => {
    const best = makeContext({
      relation: 10,
      relationLevel: 'trusted',
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(sellPrice('knife', best)).toBe(merchantPrice('knife'))
    const inv = new Inventory({ coin: 12 })
    expect(settleTransaction(inv, { knife: 1 }, {})).toBe('ok')
    expect(settleTransaction(inv, {}, { knife: 1 }, best)).toBe('ok')
    expect(inv.count('coin')).toBe(12)
  })

  it('allows non-stocked goods to exceed 100% nominal value', () => {
    const best = makeContext({
      relation: 10,
      relationLevel: 'trusted',
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(sellPrice('obsidian_sword', best)).toBe(roundSellPrice(tradeValue('obsidian_sword') * MAX_SELL_FACTOR))
  })

  it('scales trap sell price proportionally with condition and stays monotonic', () => {
    const full = createTrapInstance('trap_simple')
    const half = createTrapInstance('trap_simple')
    half.durability = 1
    const base = tradeValue('trap_simple')
    const neutral = NEUTRAL_SELL_PRICE_CONTEXT
    expect(resolveInstanceSellPrice(full, neutral)).toBe(roundSellPrice(base * BASE_SELL_FACTOR))
    expect(resolveInstanceSellPrice(half, neutral)).toBe(roundSellPrice(base * BASE_SELL_FACTOR * 0.5))
    expect(resolveInstanceSellPrice(full, neutral)! > resolveInstanceSellPrice(half, neutral)!)
  })

  it('preserves broken trap salvage pricing at 5% of nominal value', () => {
    const broken = createTrapInstance('trap_simple')
    broken.durability = 0
    const base = tradeValue('trap_simple')
    expect(resolveInstanceSellPrice(broken)).toBe(roundSellPrice(base * BROKEN_SELL_MULTIPLIER))
  })

  it('creates a fresh tent instance at condition 100 on merchant purchase', () => {
    const inv = new Inventory({ coin: 40 })
    expect(settleTransaction(inv, { tent: 1 }, {})).toBe('ok')
    expect(inv.count('tent')).toBe(0)
    expect(inv.countInstances('tent')).toBe(1)
    const tent = inv.getInstances('tent')[0]
    expect(tent && isTentItemInstance(tent) && tent.condition).toBe(100)
  })

  it('scales damaged tent sell price by 0..100 condition', () => {
    const full = createTentInstance(100)
    const half = createTentInstance(50)
    const base = tradeValue('tent')
    const neutral = NEUTRAL_SELL_PRICE_CONTEXT
    expect(resolveInstanceSellPrice(full, neutral)).toBe(roundSellPrice(base * BASE_SELL_FACTOR))
    expect(resolveInstanceSellPrice(half, neutral)).toBe(roundSellPrice(base * BASE_SELL_FACTOR * 0.5))
  })
})

describe('settleTransaction — buying with coins (supersedes buyWithCoins)', () => {
  it('is atomic: coins out, item in', () => {
    const inv = new Inventory({ coin: 50, knife: 0 })
    expect(settleTransaction(inv, { knife: 1 }, {})).toBe('ok')
    expect(inv.count('coin')).toBe(38)
    expect(inv.countInstances('knife')).toBe(1)
  })

  it('refuses when the player cannot afford it, without mutating inventory', () => {
    const inv = new Inventory({ coin: 5 })
    expect(settleTransaction(inv, { long_sword: 1 }, {})).toBe('cannot_afford')
    expect(inv.count('coin')).toBe(5)
    expect(inv.count('long_sword')).toBe(0)
  })

  it('refuses items the merchant does not stock', () => {
    const inv = new Inventory({ coin: 100 })
    expect(settleTransaction(inv, { stone: 1 }, {})).toBe('not_sold')
    expect(inv.count('coin')).toBe(100)
  })

  it('buys multiple stackable units at once for count × price coins', () => {
    const inv = new Inventory({ coin: 10, arrow: 0 })
    expect(settleTransaction(inv, { arrow: 5 }, {})).toBe('ok')
    expect(inv.count('coin')).toBe(5)
    expect(inv.count('arrow')).toBe(5)
  })

  it('refuses a multi-unit buy the player cannot afford, without mutating inventory', () => {
    const inv = new Inventory({ coin: 4, arrow: 0 })
    expect(settleTransaction(inv, { arrow: 5 }, {})).toBe('cannot_afford')
    expect(inv.count('coin')).toBe(4)
    expect(inv.count('arrow')).toBe(0)
  })

  it('buys multiple distinct instance-backed units at once', () => {
    const inv = new Inventory({ coin: 50 })
    expect(settleTransaction(inv, { knife: 3 }, {})).toBe('ok')
    expect(inv.countInstances('knife')).toBe(3)
    expect(inv.count('coin')).toBe(14)
  })

  it('buys a shopping list of several distinct kinds in one transaction', () => {
    const inv = new Inventory({ coin: 100 })
    expect(settleTransaction(inv, { knife: 1, arrow: 5 }, {})).toBe('ok')
    expect(inv.countInstances('knife')).toBe(1)
    expect(inv.count('arrow')).toBe(5)
    expect(inv.count('coin')).toBe(100 - 12 - 5)
  })
})

describe('settleTransaction — offer covers purchase (supersedes buyWithBarter)', () => {
  it('accepts an offer whose combined merchant and barter value covers the purchase for zero coins', () => {
    const inv = new Inventory({ coin: 0, shell: 6 }, undefined, [
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
    ])
    expect(settleTransaction(inv, { long_sword: 1 }, { axe: 2, shell: 6 })).toBe('ok')
    expect(inv.countInstances('axe')).toBe(0)
    expect(inv.count('shell')).toBe(0)
    expect(inv.countInstances('long_sword')).toBe(1)
    expect(inv.count('coin')).toBe(0)
  })

  it('tops up an under-covering offer with coins instead of rejecting it', () => {
    const inv = new Inventory({ coin: 20 }, undefined, [createWeaponInstance('knife')])
    expect(settleTransaction(inv, { axe: 1 }, { knife: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(0)
    expect(inv.countInstances('axe')).toBe(1)
    expect(inv.count('coin')).toBe(5)
  })

  it('refuses an under-covering offer when coins on hand cannot make up the difference', () => {
    const inv = new Inventory({ shell: 3, coin: 0 }, undefined, [createWeaponInstance('knife')])
    expect(settleTransaction(inv, { axe: 1 }, { knife: 1, shell: 3 })).toBe('cannot_afford')
    expect(inv.countInstances('knife')).toBe(1)
    expect(inv.count('shell')).toBe(3)
    expect(inv.count('axe')).toBe(0)
  })

  it('rejects an offer that names more instance-backed units than are held', () => {
    const inv = new Inventory(undefined, undefined, [createWeaponInstance('knife')])
    expect(settleTransaction(inv, { blanket: 1 }, { knife: 2 })).toBe('invalid_offer')
    expect(inv.countInstances('knife')).toBe(1)
  })

  it('scales the required offer buyback value by purchase count', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
    ])
    expect(settleTransaction(inv, { long_sword: 2 }, { axe: 5 })).toBe('ok')
    expect(inv.countInstances('axe')).toBe(0)
    expect(inv.countInstances('long_sword')).toBe(2)
  })

  it('refuses (without taking the offer) a trade that fits maxWeight but overflows maxSize', () => {
    const inv = new Inventory({ coin: 0 }, 1000, [createWeaponInstance('long_sword')], undefined, 10)
    expect(settleTransaction(inv, { arrow: 40 }, { long_sword: 1 })).toBe('full')
    expect(inv.countInstances('long_sword')).toBe(1)
    expect(inv.count('arrow')).toBe(0)
  })
})

describe('settleTransaction — offer-only, exceeding purchase cost (supersedes sellForCoins)', () => {
  it('is atomic: item out, coins in at the merchant buyback rate', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('knife')])
    expect(settleTransaction(inv, {}, { knife: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(0)
    expect(inv.count('coin')).toBe(10)
  })

  it('does not profit from buying and immediately selling stocked goods', () => {
    const inv = new Inventory({ coin: 12 })
    expect(settleTransaction(inv, { knife: 1 }, {})).toBe('ok')
    expect(settleTransaction(inv, {}, { knife: 1 })).toBe('ok')
    expect(inv.count('knife')).toBe(0)
    expect(inv.count('coin')).toBe(10)
  })

  it('credits an offer that exceeds the (zero) purchase cost at merchant buyback value', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('long_sword')])
    expect(sellPrice('long_sword')).toBe(45)
    expect(settleTransaction(inv, {}, { long_sword: 1 })).toBe('ok')
    expect(inv.count('coin')).toBe(45)
  })

  it('credits only the excess beyond the purchase at merchant buyback value when offer overshoots a real buy', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('axe')])
    expect(settleTransaction(inv, { knife: 1 }, { axe: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(1)
    expect(inv.count('coin')).toBe(22 - 12)
  })

  it('refuses shell and coin as a pure-offer sale without mutating inventory', () => {
    const inv = new Inventory({ shell: 10, coin: 4 })
    expect(settleTransaction(inv, {}, { shell: 10 })).toBe('not_sold')
    expect(settleTransaction(inv, {}, { coin: 4 })).toBe('not_sold')
    expect(inv.count('shell')).toBe(10)
    expect(inv.count('coin')).toBe(4)
  })

  it('lets barter-only shells pay down a purchase but never turn into change', () => {
    const inv = new Inventory({ coin: 0, shell: 20 })
    expect(settleTransaction(inv, { firestarter: 1 }, { shell: 20 })).toBe('ok')
    expect(inv.count('shell')).toBe(0)
    expect(inv.count('coin')).toBe(0)
  })

  it('refuses an item the player does not hold', () => {
    const inv = new Inventory({ coin: 0 })
    expect(settleTransaction(inv, {}, { axe: 1 })).toBe('invalid_offer')
    expect(inv.count('coin')).toBe(0)
  })

  it('reduces carried weight', () => {
    const inv = new Inventory({}, undefined, [createWeaponInstance('axe')])
    const before = inv.totalWeight()
    expect(settleTransaction(inv, {}, { axe: 1 })).toBe('ok')
    expect(inv.totalWeight()).toBeLessThan(before)
  })

  it('rejects an empty transaction', () => {
    const inv = new Inventory({ coin: 10 })
    expect(settleTransaction(inv, {}, {})).toBe('invalid_offer')
  })
})

describe('merchant transaction preview/commit parity', () => {
  it('matches preview and settlement for mixed baskets and instance-backed offers', () => {
    const inv = new Inventory({ coin: 5 }, undefined, [
      createWeaponInstance('knife'),
      createWeaponInstance('axe'),
    ])
    const purchases = { blanket: 1 }
    const offer = { knife: 1 }
    const preview = previewTransactionNetCoins(inv, purchases, offer)
    expect(settleTransaction(inv, purchases, offer)).toBe('ok')
    expect(inv.count('coin')).toBe(5 - preview)
  })

  it('values mixed-condition instance groups using the same worst-condition selection as settlement', () => {
    const good = createWeaponInstance('knife')
    const bad = createWeaponInstance('knife')
    bad.durability = 0.2
    bad.sharpness = 0.2
    const inv = new Inventory(undefined, undefined, [good, bad])
    const line = resolveOfferLineBuyback(inv, 'knife', 1)
    expect(line.instanceIds).toEqual([bad.id])
    expect(settleTransaction(inv, {}, { knife: 1 })).toBe('ok')
    expect(inv.getInstance(good.id)).not.toBeNull()
    expect(inv.getInstance(bad.id)).toBeNull()
  })
})

describe('settlePricedPurchase (plan quests-progression-012)', () => {
  const HORSE_PRICE = 250

  it('is atomic: coins out and external commit runs only after validation', () => {
    const inv = new Inventory({ coin: HORSE_PRICE })
    let committed = false
    expect(settlePricedPurchase(inv, HORSE_PRICE, {}, NEUTRAL_SELL_PRICE_CONTEXT, () => {
      committed = true
      return true
    })).toBe('ok')
    expect(committed).toBe(true)
    expect(inv.count('coin')).toBe(0)
  })

  it('leaves inventory unchanged when commit fails', () => {
    const inv = new Inventory({ coin: HORSE_PRICE })
    expect(settlePricedPurchase(inv, HORSE_PRICE, {}, NEUTRAL_SELL_PRICE_CONTEXT, () => false)).toBe('not_sold')
    expect(inv.count('coin')).toBe(HORSE_PRICE)
  })

  it('refuses insufficient coins without mutating inventory or calling commit', () => {
    const inv = new Inventory({ coin: 5 })
    let committed = false
    expect(settlePricedPurchase(inv, HORSE_PRICE, {}, NEUTRAL_SELL_PRICE_CONTEXT, () => {
      committed = true
      return true
    })).toBe('cannot_afford')
    expect(committed).toBe(false)
    expect(inv.count('coin')).toBe(5)
  })

  it('matches preview net coins for barter+coin horse purchases', () => {
    const inv = new Inventory({ coin: 240, shell: 20 })
    const offer = { shell: 10 }
    const preview = previewPricedPurchaseNetCoins(inv, HORSE_PRICE, offer)
    expect(settlePricedPurchase(inv, HORSE_PRICE, offer, NEUTRAL_SELL_PRICE_CONTEXT, () => true)).toBe('ok')
    expect(inv.count('coin')).toBe(240 - preview)
    expect(inv.count('shell')).toBe(10)
  })
})
