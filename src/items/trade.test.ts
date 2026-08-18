import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { buyWithBarter, buyWithShells, sellForShells } from './trade'
import { MERCHANT_STOCK, merchantPrice, offerValue, sellPrice, tradeValue } from './tradeCatalog'

describe('tradeCatalog (plan 090)', () => {
  it('lists every stocked item with a positive shell price', () => {
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

describe('buyWithShells', () => {
  it('is atomic: shells out, item in', () => {
    const inv = new Inventory({ shell: 50, knife: 0 })
    expect(buyWithShells(inv, 'knife')).toBe('ok')
    expect(inv.count('shell')).toBe(38)
    expect(inv.count('knife')).toBe(1)
  })

  it('refuses when the player cannot afford it, without mutating inventory', () => {
    const inv = new Inventory({ shell: 5 })
    expect(buyWithShells(inv, 'long_sword')).toBe('cannot_afford')
    expect(inv.count('shell')).toBe(5)
    expect(inv.count('long_sword')).toBe(0)
  })

  it('refuses items the merchant does not stock', () => {
    const inv = new Inventory({ shell: 100 })
    expect(buyWithShells(inv, 'stone')).toBe('not_sold')
    expect(inv.count('shell')).toBe(100)
  })
})

describe('buyWithBarter', () => {
  it('accepts an offer whose combined value covers the price', () => {
    const inv = new Inventory({ axe: 2 })
    expect(offerValue({ axe: 2 })).toBe(50)
    expect(buyWithBarter(inv, 'long_sword', { axe: 2 })).toBe('ok')
    expect(inv.count('axe')).toBe(0)
    expect(inv.count('long_sword')).toBe(1)
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

describe('sellForShells', () => {
  it('is atomic: item out, shells in at the sell spread', () => {
    const inv = new Inventory({ knife: 1, shell: 0 })
    expect(sellForShells(inv, 'knife')).toBe('ok')
    expect(inv.count('knife')).toBe(0)
    expect(inv.count('shell')).toBe(6)
  })

  it('does not profit from buying and immediately selling', () => {
    const inv = new Inventory({ shell: 12 })
    expect(buyWithShells(inv, 'knife')).toBe('ok')
    expect(sellForShells(inv, 'knife')).toBe('ok')
    expect(inv.count('knife')).toBe(0)
    expect(inv.count('shell')).toBe(6)
  })

  it('refuses shell and coin without mutating inventory', () => {
    const inv = new Inventory({ shell: 10, coin: 4 })
    expect(sellForShells(inv, 'shell')).toBe('not_sold')
    expect(sellForShells(inv, 'coin')).toBe('not_sold')
    expect(inv.count('shell')).toBe(10)
    expect(inv.count('coin')).toBe(4)
  })

  it('refuses an item the player does not hold', () => {
    const inv = new Inventory({ shell: 0 })
    expect(sellForShells(inv, 'axe')).toBe('invalid_offer')
    expect(inv.count('shell')).toBe(0)
  })

  it('reduces carried weight', () => {
    const inv = new Inventory({ axe: 1 })
    const before = inv.totalWeight()
    expect(sellForShells(inv, 'axe')).toBe('ok')
    expect(inv.totalWeight()).toBeLessThan(before)
  })
})
