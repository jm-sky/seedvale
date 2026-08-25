import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { settleTransaction } from './trade'
import { MERCHANT_STOCK, merchantPrice, offerValue, sellPrice, tradeValue } from './tradeCatalog'
import { createWeaponInstance } from './weaponMaintenance'

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

describe('sellPrice', () => {
  it('is half the trade value, floored, at least 1', () => {
    expect(sellPrice('knife')).toBe(6)
    expect(sellPrice('long_sword')).toBe(25)
    expect(sellPrice('stone')).toBe(1)
  })

  it('refuses shell and coin', () => {
    expect(sellPrice('shell')).toBeNull()
    expect(sellPrice('coin')).toBeNull()
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
  // Plan 161 moved knife/axe/sword/etc. into `instances`, not `counts` — real
  // gameplay never has these as plain stack counts
  // (`migrateWeaponCountsToInstances` converts on load), so these build the
  // offer inventories the way a real save actually holds them.
  it('accepts an offer whose combined value exactly covers the price for zero coins (today\'s barter case)', () => {
    const inv = new Inventory(undefined, undefined, [
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
    ])
    expect(offerValue({ axe: 2 })).toBe(50)
    expect(settleTransaction(inv, { long_sword: 1 }, { axe: 2 })).toBe('ok')
    expect(inv.countInstances('axe')).toBe(0)
    expect(inv.countInstances('long_sword')).toBe(1)
    expect(inv.count('coin')).toBe(0)
  })

  it('tops up an under-covering offer with coins instead of rejecting it', () => {
    const inv = new Inventory({ coin: 20 }, undefined, [createWeaponInstance('knife')])
    // knife tradeValue 12, axe price 25 → offer covers 12, player pays the 13 coin difference
    expect(settleTransaction(inv, { axe: 1 }, { knife: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(0)
    expect(inv.countInstances('axe')).toBe(1)
    expect(inv.count('coin')).toBe(7)
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

  it('scales the required offer value by purchase count', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
      createWeaponInstance('axe'),
    ])
    expect(offerValue({ axe: 4 })).toBe(100)
    expect(settleTransaction(inv, { long_sword: 2 }, { axe: 4 })).toBe('ok')
    expect(inv.countInstances('axe')).toBe(0)
    expect(inv.countInstances('long_sword')).toBe(2)
  })

  it('refuses (without taking the offer) a trade that fits maxWeight but overflows maxSize', () => {
    // A single `long_sword` (weight 2.5, size LG=4) covers 40 arrows in
    // value; arrows are near-weightless (0.05 each, XS=1 size each), so the
    // swap barely moves the weight total but blows a tight size cap. Before
    // this fix `wouldFitAfter` only checked weight, so the sword would be
    // handed over and `Inventory.add` would then silently no-op on the
    // arrows — sword gone, no arrows received.
    const inv = new Inventory({ coin: 0 }, 1000, [createWeaponInstance('long_sword')], undefined, 10)
    expect(settleTransaction(inv, { arrow: 40 }, { long_sword: 1 })).toBe('full')
    expect(inv.countInstances('long_sword')).toBe(1)
    expect(inv.count('arrow')).toBe(0)
  })
})

describe('settleTransaction — offer-only, exceeding purchase cost (supersedes sellForCoins)', () => {
  it('is atomic: item out, coins in at the sell spread', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('knife')])
    expect(settleTransaction(inv, {}, { knife: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(0)
    expect(inv.count('coin')).toBe(6)
  })

  it('does not profit from buying and immediately selling', () => {
    const inv = new Inventory({ coin: 12 })
    expect(settleTransaction(inv, { knife: 1 }, {})).toBe('ok')
    expect(settleTransaction(inv, {}, { knife: 1 })).toBe('ok')
    expect(inv.count('knife')).toBe(0)
    expect(inv.count('coin')).toBe(6)
  })

  it('credits an offer that exceeds the (zero) purchase cost at half value, matching sellPrice', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('long_sword')])
    expect(sellPrice('long_sword')).toBe(25)
    expect(settleTransaction(inv, {}, { long_sword: 1 })).toBe('ok')
    expect(inv.count('coin')).toBe(25)
  })

  it('credits only the excess beyond the purchase at half value when offer overshoots a real buy', () => {
    // axe tradeValue 25 offered against a 12-coin knife purchase: 12 of the
    // 25 covers the knife at full barter rate, the remaining 13 is halved.
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('axe')])
    expect(settleTransaction(inv, { knife: 1 }, { axe: 1 })).toBe('ok')
    expect(inv.countInstances('knife')).toBe(1)
    expect(inv.count('coin')).toBe(Math.floor((25 - 12) * 0.5))
  })

  it('refuses shell and coin as a pure-offer sale without mutating inventory', () => {
    const inv = new Inventory({ shell: 10, coin: 4 })
    expect(settleTransaction(inv, {}, { shell: 10 })).toBe('not_sold')
    expect(settleTransaction(inv, {}, { coin: 4 })).toBe('not_sold')
    expect(inv.count('shell')).toBe(10)
    expect(inv.count('coin')).toBe(4)
  })

  it('lets barter-only shells pay down a purchase but never turn into change', () => {
    // 5 shells (tradeValue 1 each = 5) fully cover a 5-coin? no merchant kind
    // costs that little except firestarter/wooden_torch (8); use those with
    // extra shells so the excess (barter-only) value has nowhere to go.
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
