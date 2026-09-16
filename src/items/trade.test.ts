import { describe, expect, it } from 'vitest'
import type { RelationLevel } from '../quests/quests'
import { NEUTRAL_REPUTATION } from '../reputation/ReputationManager'
import { seedMerchantStockIfNeeded } from '../settlement/merchantTrade'
import { createArmorInstance, effectiveInstanceWeight } from './armorItemInstances'
import { Inventory } from './Inventory'
import { createKeyInstance, createTentInstance, isTentItemInstance } from './itemInstances'
import { ITEM_DEFS } from './items'
import {
  createAcquiredInstance,
  type OwnedGoodsPurchaseLine,
  previewPricedPurchaseNetCoins,
  previewTransactionNetCoins,
  resolveOfferLineBuyback,
  settleMerchantStockTransaction,
  settleOwnedGoodsPurchase,
  settlePricedPurchase,
  settleTransaction,
} from './trade'
import {
  BASE_BUY_FACTOR,
  BASE_SELL_FACTOR,
  BROKEN_SELL_MULTIPLIER,
  fullConditionBuyFactor,
  fullConditionSellFactor,
  MAX_BUY_FACTOR,
  MAX_SELL_FACTOR,
  MERCHANT_STOCK,
  merchantInstancePrice,
  merchantPrice,
  MIN_BUY_FACTOR,
  NEUTRAL_SELL_PRICE_CONTEXT,
  npcInstanceSalePrice,
  npcSalePrice,
  relationshipEffect,
  reputationEffect,
  resolveInstanceSellPrice,
  roundSellPrice,
  sellPrice,
  type SellPriceContext,
  tradeValue,
} from './tradeCatalog'
import { applyPurchaseMarkup } from './tradeGrievance'
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

  it('stocks herb at 5 coins as a quest reachability fallback', () => {
    expect(merchantPrice('herb')).toBe(5)
    expect(tradeValue('herb')).toBe(5)
    expect(MERCHANT_STOCK).toContain('herb')
  })

  it('gives shells a barter value of 1', () => {
    expect(tradeValue('shell')).toBe(1)
  })

  it('values legacy authored ruby at ruby_medium parity (plan settlements-016)', () => {
    expect(tradeValue('ruby')).toBe(70)
    expect(tradeValue('ruby_small')).toBe(30)
    expect(tradeValue('ruby_medium')).toBe(70)
    expect(tradeValue('ruby_large')).toBe(150)
    const rubySell = sellPrice('ruby', NEUTRAL_SELL_PRICE_CONTEXT)
    expect(rubySell).toBe(
      roundSellPrice(tradeValue('ruby') * fullConditionSellFactor(NEUTRAL_SELL_PRICE_CONTEXT)),
    )
    expect(rubySell).toBeGreaterThan(1)
    expect(tradeValue('hide')).toBe(Math.max(1, Math.round(0.6 * 4)))
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

describe('NPC buy pricing (plan settlements-npcs-033)', () => {
  it('produces a deterministic baseline price at neutral standing', () => {
    expect(fullConditionBuyFactor(NEUTRAL_SELL_PRICE_CONTEXT)).toBeCloseTo(BASE_BUY_FACTOR, 5)
    expect(npcSalePrice('iron_rod')).toBe(roundSellPrice(tradeValue('iron_rod') * BASE_BUY_FACTOR))
  })

  it('never raises the player price for better relation/reputation', () => {
    const good = makeContext({
      relation: 10,
      relationLevel: 'trusted',
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(fullConditionBuyFactor(good)).toBeCloseTo(MIN_BUY_FACTOR, 5)
    expect(npcSalePrice('iron_rod', good)).toBeLessThanOrEqual(npcSalePrice('iron_rod', NEUTRAL_SELL_PRICE_CONTEXT))
  })

  it('never lowers the player price for worse relation/reputation', () => {
    const bad = makeContext({
      relation: -10,
      relationLevel: 'stranger',
      reputation: { trust: -100, integrity: -100, competence: -100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    expect(fullConditionBuyFactor(bad)).toBeCloseTo(MAX_BUY_FACTOR, 5)
    expect(npcSalePrice('iron_rod', bad)).toBeGreaterThanOrEqual(npcSalePrice('iron_rod', NEUTRAL_SELL_PRICE_CONTEXT))
  })

  it('never creates a buy(best standing)->sell(merchant) arbitrage loop for the same context', () => {
    const best = makeContext({
      relation: 10,
      relationLevel: 'trusted',
      reputation: { trust: 100, integrity: 100, competence: 100, benevolence: 0, courage: 0 },
      renown: 100,
    })
    for (const kind of ['arrow', 'iron_rod', 'long_sword'] as const) {
      expect(npcSalePrice(kind, best)).toBeGreaterThanOrEqual(sellPrice(kind, best) ?? 0)
    }
  })

  it('falls back to tradeValue for a good the merchant catalog does not stock', () => {
    expect(merchantPrice('iron')).toBeNull()
    expect(npcSalePrice('iron')).toBe(roundSellPrice(tradeValue('iron') * BASE_BUY_FACTOR))
  })

  it('prices newly traded household outputs from the shared valuation layer (plan settlements-npcs-036)', () => {
    expect(merchantPrice('wool_material')).toBeNull()
    expect(tradeValue('wool_material')).toBe(2)
    expect(tradeValue('linen_material')).toBe(6)
    expect(tradeValue('dressing')).toBe(16)
    expect(tradeValue('dressing')).toBeGreaterThan(tradeValue('bandage'))
    expect(npcSalePrice('wool_material')).toBe(roundSellPrice(tradeValue('wool_material') * BASE_BUY_FACTOR))
    expect(npcSalePrice('dressing')).toBe(roundSellPrice(tradeValue('dressing') * BASE_BUY_FACTOR))
  })
})

describe('settleOwnedGoodsPurchase (plan settlements-npcs-033)', () => {
  it('transfers exact stack quantity and pays the real owner, not a mint', () => {
    const buyer = new Inventory({ coin: 10 })
    const source = new Inventory({ arrow: 31 })
    const payee = new Inventory()
    const lines: OwnedGoodsPurchaseLine[] = [{ kind: 'arrow', count: 5, unitPrice: 1 }]
    expect(settleOwnedGoodsPurchase(buyer, source, payee, lines)).toBe('ok')
    expect(buyer.count('arrow')).toBe(5)
    expect(source.count('arrow')).toBe(26)
    expect(buyer.count('coin')).toBe(5)
    expect(payee.count('coin')).toBe(5)
  })

  it('refuses without mutating anything when the source no longer has enough stock', () => {
    const buyer = new Inventory({ coin: 10 })
    const source = new Inventory({ arrow: 3 })
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('not_sold')
    expect(source.count('arrow')).toBe(3)
    expect(buyer.count('coin')).toBe(10)
    expect(payee.count('coin')).toBe(0)
  })

  it('refuses without mutating anything when the buyer cannot afford it', () => {
    const buyer = new Inventory({ coin: 2 })
    const source = new Inventory({ arrow: 10 })
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('cannot_afford')
    expect(source.count('arrow')).toBe(10)
    expect(buyer.count('coin')).toBe(2)
  })

  it('refuses without mutating anything when the payment destination is full', () => {
    const buyer = new Inventory({ coin: 10 })
    const source = new Inventory({ arrow: 10 })
    const payee = new Inventory({ coin: 0 }, 0)
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('full')
    expect(source.count('arrow')).toBe(10)
    expect(buyer.count('coin')).toBe(10)
    expect(payee.count('coin')).toBe(0)
  })

  it('refuses without mutating anything when the buyer cannot carry the goods', () => {
    const buyer = new Inventory({ coin: 10 }, 0)
    const source = new Inventory({ arrow: 10 })
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('full')
    expect(source.count('arrow')).toBe(10)
    expect(buyer.count('coin')).toBe(10)
  })

  it('transfers real existing instances instead of minting replacements', () => {
    const worn = createWeaponInstance('knife')
    worn.durability = 0.2
    worn.sharpness = 0.2
    const fresh = createWeaponInstance('knife')
    const buyer = new Inventory({ coin: 50 })
    const source = new Inventory(undefined, undefined, [worn, fresh])
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'knife', count: 1, unitPrice: 12 }])).toBe('ok')
    expect(source.getInstance(worn.id)).toBeNull()
    expect(buyer.getInstance(worn.id)).not.toBeNull()
    expect(source.getInstance(fresh.id)).not.toBeNull()
    expect(buyer.count('coin')).toBe(38)
  })

  it('settles a multi-kind basket atomically', () => {
    const buyer = new Inventory({ coin: 20 })
    const source = new Inventory({ arrow: 10, iron_rod: 2 })
    const payee = new Inventory()
    const lines: OwnedGoodsPurchaseLine[] = [
      { kind: 'arrow', count: 4, unitPrice: 1 },
      { kind: 'iron_rod', count: 2, unitPrice: 8 },
    ]
    expect(settleOwnedGoodsPurchase(buyer, source, payee, lines)).toBe('ok')
    expect(buyer.count('arrow')).toBe(4)
    expect(buyer.count('iron_rod')).toBe(2)
    expect(source.count('arrow')).toBe(6)
    expect(source.count('iron_rod')).toBe(0)
    expect(payee.count('coin')).toBe(4 + 16)
  })

  it('rejects an empty basket', () => {
    const buyer = new Inventory({ coin: 10 })
    const source = new Inventory({ arrow: 10 })
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [])).toBe('invalid_offer')
  })

  it('cannot duplicate goods across repeated commits beyond real stock', () => {
    const buyer = new Inventory({ coin: 100 })
    const source = new Inventory({ arrow: 5 })
    const payee = new Inventory()
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('ok')
    expect(settleOwnedGoodsPurchase(buyer, source, payee, [{ kind: 'arrow', count: 5, unitPrice: 1 }])).toBe('not_sold')
    expect(buyer.count('arrow')).toBe(5)
  })

  it('settles mixed household and personal sources atomically (plan settlements-npcs-036)', () => {
    const buyer = new Inventory({ coin: 40 })
    const household = new Inventory({ wool_material: 12 })
    const personal = new Inventory({ iron_rod: 2 })
    const payee = personal
    const lines: OwnedGoodsPurchaseLine[] = [
      { kind: 'wool_material', count: 4, unitPrice: 2, source: household },
      { kind: 'iron_rod', count: 1, unitPrice: 8, source: personal },
    ]
    expect(settleOwnedGoodsPurchase(buyer, household, payee, lines)).toBe('ok')
    expect(buyer.count('wool_material')).toBe(4)
    expect(buyer.count('iron_rod')).toBe(1)
    expect(household.count('wool_material')).toBe(8)
    expect(personal.count('iron_rod')).toBe(1)
    expect(buyer.count('coin')).toBe(40 - 8 - 8)
    expect(payee.count('coin')).toBe(16)
  })

  it('refuses a mixed basket without mutating either owner when one source is short', () => {
    const buyer = new Inventory({ coin: 40 })
    const household = new Inventory({ wool_material: 1 })
    const personal = new Inventory({ iron_rod: 2 })
    const lines: OwnedGoodsPurchaseLine[] = [
      { kind: 'wool_material', count: 4, unitPrice: 2, source: household },
      { kind: 'iron_rod', count: 1, unitPrice: 8, source: personal },
    ]
    expect(settleOwnedGoodsPurchase(buyer, household, personal, lines)).toBe('not_sold')
    expect(household.count('wool_material')).toBe(1)
    expect(personal.count('iron_rod')).toBe(2)
    expect(buyer.count('coin')).toBe(40)
    expect(buyer.count('wool_material')).toBe(0)
  })

  it('transfers an existing instance from a named personal source without reminting', () => {
    const worn = createWeaponInstance('knife')
    worn.durability = 0.4
    worn.sharpness = 0.3
    const buyer = new Inventory({ coin: 20 })
    const personal = new Inventory(undefined, undefined, [worn])
    const household = new Inventory({ arrow: 10 })
    expect(settleOwnedGoodsPurchase(
      buyer,
      household,
      personal,
      [{ kind: 'knife', count: 1, unitPrice: 12, source: personal }],
    )).toBe('ok')
    expect(personal.getInstance(worn.id)).toBeNull()
    expect(buyer.getInstance(worn.id)).toMatchObject({ id: worn.id, durability: 0.4, sharpness: 0.3 })
    expect(household.count('arrow')).toBe(10)
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

  it('applies the same purchase markup to preview and merchant settlement (plan items-player-042)', () => {
    const inv = new Inventory({ coin: 20 })
    const purchases = { bread: 1 }
    const markup = 0.15
    const listed = merchantPrice('bread')!
    const preview = previewTransactionNetCoins(inv, purchases, {}, NEUTRAL_SELL_PRICE_CONTEXT, 0, markup)
    expect(preview).toBe(Math.floor(listed * 1.15))
    expect(settleTransaction(inv, purchases, {}, NEUTRAL_SELL_PRICE_CONTEXT, markup)).toBe('ok')
    expect(inv.count('coin')).toBe(20 - preview)
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

describe('createAcquiredInstance key (world-024)', () => {
  it('mints a generic key, while systemic keys keep the caller-supplied id', () => {
    const acquired = createAcquiredInstance('key')
    expect(acquired?.kind).toBe('key')
    expect(acquired?.id).toBeTypeOf('string')
    expect(acquired?.id).not.toBe('item:treasure-key:site')
    expect(createKeyInstance('item:treasure-key:site')).toEqual({
      id: 'item:treasure-key:site',
      kind: 'key',
    })
  })
})

describe('armor quality pricing and merchant instance trade (plan items-player-040)', () => {
  it('keeps ordinary armor acquisition at common and does not randomize quality', () => {
    const minted = createAcquiredInstance('chainmail')
    expect(minted && 'quality' in minted ? minted.quality : null).toBe('common')
  })

  it('orders instance buy and sell prices poor < common < good < masterwork', () => {
    const qualities = ['poor', 'common', 'good', 'masterwork'] as const
    const buy = qualities.map((quality) => merchantInstancePrice(createArmorInstance('chainmail', quality))!)
    const sell = qualities.map((quality) => resolveInstanceSellPrice(createArmorInstance('chainmail', quality), NEUTRAL_SELL_PRICE_CONTEXT)!)
    const socialSell = qualities.map((quality) => resolveInstanceSellPrice(
      createArmorInstance('chainmail', quality),
      makeContext({ relation: 80, relationLevel: 'trusted' }),
    )!)
    for (let i = 0; i < qualities.length - 1; i++) {
      expect(buy[i]).toBeLessThan(buy[i + 1]!)
      expect(sell[i]).toBeLessThan(sell[i + 1]!)
      expect(socialSell[i]).toBeLessThan(socialSell[i + 1]!)
    }
    expect(buy[1]).toBe(merchantPrice('chainmail'))
    expect(npcInstanceSalePrice(createArmorInstance('chainmail', 'poor'))).toBeLessThan(
      npcInstanceSalePrice(createArmorInstance('chainmail', 'masterwork')),
    )
  })

  it('sells lower-quality armor first in kind/count baskets', () => {
    const poor = createArmorInstance('chainmail', 'poor', 'armor:poor')
    const masterwork = createArmorInstance('chainmail', 'masterwork', 'armor:mw')
    const inventory = new Inventory({}, Infinity, [masterwork, poor], undefined, Infinity)
    const line = resolveOfferLineBuyback(inventory, 'chainmail', 1)
    expect(line.instanceIds).toEqual(['armor:poor'])
    expect(line.value).toBe(resolveInstanceSellPrice(poor))
  })

  it('transfers the selected merchant armor instance without recreating common', () => {
    const poor = createArmorInstance('chainmail', 'poor', 'armor:poor')
    const good = createArmorInstance('chainmail', 'good', 'armor:good')
    const stock = new Inventory(undefined, Infinity, [poor, good], undefined, Infinity)
    const buyer = new Inventory({ coin: 1000 }, Infinity, undefined, undefined, Infinity)
    const listedGood = merchantInstancePrice(good)!
    const listedPoor = merchantInstancePrice(poor)!
    expect(listedGood).not.toBe(listedPoor)

    const result = settleMerchantStockTransaction(buyer, stock, {}, {}, NEUTRAL_SELL_PRICE_CONTEXT, ['armor:good'])
    expect(result).toBe('ok')
    const bought = buyer.getInstance('armor:good')
    expect(bought).toEqual(good)
    expect(stock.getInstance('armor:good')).toBeNull()
    expect(stock.getInstance('armor:poor')).toEqual(poor)
    expect(buyer.count('coin')).toBe(1000 - listedGood)
    expect(buyer.getInstances('chainmail')).toHaveLength(1)

    seedMerchantStockIfNeeded(stock, { merchantStockInitialized: true }, { chainmail: 4 })
    expect(stock.getInstances('chainmail')).toHaveLength(1)
    expect(stock.getInstance('armor:poor')).toEqual(poor)
  })

  it('applies purchase markup per merchant armor instance, not on the summed cost (plan items-player-042)', () => {
    const good = createArmorInstance('chainmail', 'good', 'armor:good')
    const stock = new Inventory(undefined, Infinity, [good], undefined, Infinity)
    const buyer = new Inventory({ coin: 1000 }, Infinity, undefined, undefined, Infinity)
    const markup = 0.15
    const listedGood = merchantInstancePrice(good)!
    const marked = applyPurchaseMarkup(listedGood, markup)
    expect(settleMerchantStockTransaction(
      buyer, stock, {}, {}, NEUTRAL_SELL_PRICE_CONTEXT, ['armor:good'], markup,
    )).toBe('ok')
    expect(buyer.count('coin')).toBe(1000 - marked)
  })

  it('uses effective armor weight for merchant purchase capacity preflight', () => {
    const poor = createArmorInstance('chainmail', 'poor', 'armor:poor')
    const masterwork = createArmorInstance('chainmail', 'masterwork', 'armor:mw')
    const poorWeight = effectiveInstanceWeight(poor)
    const mwWeight = effectiveInstanceWeight(masterwork)
    expect(poorWeight).toBeGreaterThan(ITEM_DEFS.chainmail.weight)
    expect(mwWeight).toBeLessThan(ITEM_DEFS.chainmail.weight)

    const coinWeight = 1000 * ITEM_DEFS.coin.weight
    const tightBuyer = new Inventory({ coin: 1000 }, coinWeight + mwWeight + 0.01, undefined, undefined, Infinity)
    const poorStock = new Inventory(undefined, Infinity, [poor], undefined, Infinity)
    const mwStock = new Inventory(undefined, Infinity, [masterwork], undefined, Infinity)
    expect(settleMerchantStockTransaction(tightBuyer, poorStock, {}, {}, NEUTRAL_SELL_PRICE_CONTEXT, ['armor:poor'])).toBe('full')
    expect(settleMerchantStockTransaction(tightBuyer, mwStock, {}, {}, NEUTRAL_SELL_PRICE_CONTEXT, ['armor:mw'])).toBe('ok')
    expect(tightBuyer.getInstance('armor:mw')).toEqual(masterwork)
  })

  it('generic NPC instance purchase can transfer an exact armor quality', () => {
    const good = createArmorInstance('leather_armor', 'good', 'armor:npc-good')
    const source = new Inventory(undefined, Infinity, [good], undefined, Infinity)
    const buyer = new Inventory({ coin: 200 }, Infinity, undefined, undefined, Infinity)
    const pay = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
    const unitPrice = npcInstanceSalePrice(good)
    const result = settleOwnedGoodsPurchase(buyer, source, pay, [{
      kind: 'leather_armor',
      count: 1,
      unitPrice,
      instanceIds: ['armor:npc-good'],
    }])
    expect(result).toBe('ok')
    expect(buyer.getInstance('armor:npc-good')).toEqual(good)
    expect(source.getInstances('leather_armor')).toHaveLength(0)
    expect(pay.count('coin')).toBe(unitPrice)
  })
})
