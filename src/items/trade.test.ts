import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { buyWithBarter, buyWithCoins, sellForCoins } from './trade'
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

describe('buyWithCoins', () => {
  it('is atomic: coins out, item in', () => {
    const inv = new Inventory({ coin: 50, knife: 0 })
    expect(buyWithCoins(inv, 'knife')).toBe('ok')
    expect(inv.count('coin')).toBe(38)
    expect(inv.countInstances('knife')).toBe(1)
  })

  it('refuses when the player cannot afford it, without mutating inventory', () => {
    const inv = new Inventory({ coin: 5 })
    expect(buyWithCoins(inv, 'long_sword')).toBe('cannot_afford')
    expect(inv.count('coin')).toBe(5)
    expect(inv.count('long_sword')).toBe(0)
  })

  it('refuses items the merchant does not stock', () => {
    const inv = new Inventory({ coin: 100 })
    expect(buyWithCoins(inv, 'stone')).toBe('not_sold')
    expect(inv.count('coin')).toBe(100)
  })
})

describe('buyWithBarter', () => {
  it('accepts an offer whose combined value covers the price', () => {
    const inv = new Inventory({ axe: 2 })
    expect(offerValue({ axe: 2 })).toBe(50)
    expect(buyWithBarter(inv, 'long_sword', { axe: 2 })).toBe('ok')
    expect(inv.count('axe')).toBe(0)
    expect(inv.countInstances('long_sword')).toBe(1)
  })

  it('rejects an under-valued offer without taking items', () => {
    const inv = new Inventory({ knife: 1, shell: 3 })
    expect(buyWithBarter(inv, 'axe', { knife: 1, shell: 3 })).toBe('cannot_afford')
    expect(inv.count('knife')).toBe(1)
    expect(inv.count('shell')).toBe(3)
    expect(inv.count('axe')).toBe(0)
  })

  it('rejects an offer the inventory does not actually hold', () => {
    const inv = new Inventory({ knife: 1 })
    expect(buyWithBarter(inv, 'blanket', { knife: 2 })).toBe('invalid_offer')
    expect(inv.count('knife')).toBe(1)
  })
})

describe('sellForCoins', () => {
  it('is atomic: item out, coins in at the sell spread', () => {
    const inv = new Inventory({ coin: 0 }, undefined, [createWeaponInstance('knife')])
    expect(sellForCoins(inv, 'knife')).toBe('ok')
    expect(inv.countInstances('knife')).toBe(0)
    expect(inv.count('coin')).toBe(6)
  })

  it('does not profit from buying and immediately selling', () => {
    const inv = new Inventory({ coin: 12 })
    expect(buyWithCoins(inv, 'knife')).toBe('ok')
    expect(sellForCoins(inv, 'knife')).toBe('ok')
    expect(inv.count('knife')).toBe(0)
    expect(inv.count('coin')).toBe(6)
  })

  it('refuses shell and coin without mutating inventory', () => {
    const inv = new Inventory({ shell: 10, coin: 4 })
    expect(sellForCoins(inv, 'shell')).toBe('not_sold')
    expect(sellForCoins(inv, 'coin')).toBe('not_sold')
    expect(inv.count('shell')).toBe(10)
    expect(inv.count('coin')).toBe(4)
  })

  it('refuses an item the player does not hold', () => {
    const inv = new Inventory({ coin: 0 })
    expect(sellForCoins(inv, 'axe')).toBe('invalid_offer')
    expect(inv.count('coin')).toBe(0)
  })

  it('reduces carried weight', () => {
    const inv = new Inventory({}, undefined, [createWeaponInstance('axe')])
    const before = inv.totalWeight()
    expect(sellForCoins(inv, 'axe')).toBe('ok')
    expect(inv.totalWeight()).toBeLessThan(before)
  })
})
