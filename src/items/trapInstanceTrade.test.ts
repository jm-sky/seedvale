import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { isTrapItemInstance } from './itemInstances'
import {
  selectInstancesToSell,
  sellInstancesForCoins,
  settleTransaction,
} from './trade'
import { BROKEN_SELL_MULTIPLIER, resolveInstanceSellPrice, tradeValue } from './tradeCatalog'
import { createTrapInstance } from './trapItemInstances'

describe('trap instance trade (plan 155)', () => {
  it('buying trap_simple creates one instance with max durability', () => {
    const inv = new Inventory({ coin: 100 })
    expect(settleTransaction(inv, { trap_simple: 1 }, {})).toBe('ok')
    expect(inv.count('trap_simple')).toBe(0)
    const instances = inv.getInstances('trap_simple')
    expect(instances).toHaveLength(1)
    const first = instances[0]
    expect(first?.kind).toBe('trap_simple')
    if (first && isTrapItemInstance(first)) {
      expect(first.durability).toBe(2)
    }
  })

  it('buying three traps creates three distinct ids', () => {
    const inv = new Inventory({ coin: 100 })
    expect(settleTransaction(inv, { trap_simple: 1 }, {})).toBe('ok')
    expect(settleTransaction(inv, { trap_simple: 1 }, {})).toBe('ok')
    expect(settleTransaction(inv, { trap_simple: 1 }, {})).toBe('ok')
    const ids = inv.getInstances('trap_simple').map((inst) => inst.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('applies the central condition discount curve', () => {
    const full = createTrapInstance('trap_simple')
    const half = createTrapInstance('trap_simple')
    half.durability = 1
    const base = tradeValue('trap_simple')
    expect(resolveInstanceSellPrice(full)).toBe(Math.max(1, Math.floor(base * 0.9 * 0.5)))
    expect(resolveInstanceSellPrice(half)).toBe(Math.max(1, Math.floor(base * (1 - 0.175) * 0.5)))
  })

  it('sells broken traps for a very low price', () => {
    const broken = createTrapInstance('trap_simple')
    broken.durability = 0
    const price = resolveInstanceSellPrice(broken)
    expect(price).toBe(Math.max(1, Math.floor(tradeValue('trap_simple') * BROKEN_SELL_MULTIPLIER)))
  })

  it('auto-sell chooses the lowest condition first with stable id tie-break', () => {
    const a = createTrapInstance('trap_simple')
    const b = createTrapInstance('trap_simple')
    const c = createTrapInstance('trap_simple')
    a.durability = 2
    b.durability = 2
    c.durability = 1
    const ids = selectInstancesToSell([a, b, c], 2)
    expect(ids).toContain(c.id)
    expect(ids).toHaveLength(2)
    if (a.id < b.id) {
      expect(ids[1]).toBe(a.id)
    } else {
      expect(ids[1]).toBe(b.id)
    }
  })

  it('manual multi-sell is atomic', () => {
    const inv = new Inventory()
    const a = createTrapInstance('trap_simple')
    const b = createTrapInstance('trap_simple')
    inv.addInstance(a)
    inv.addInstance(b)
    const sold = sellInstancesForCoins(inv, [a.id, 'missing'])
    expect(sold.result).toBe('invalid_offer')
    expect(inv.countInstances('trap_simple')).toBe(2)
  })

  it('settleTransaction sells a concrete instance for trap kinds (supersedes sellForCoins)', () => {
    const inv = new Inventory({ coin: 0 })
    const a = createTrapInstance('trap_simple')
    const b = createTrapInstance('trap_simple')
    b.durability = 1
    inv.addInstance(a)
    inv.addInstance(b)
    expect(settleTransaction(inv, {}, { trap_simple: 1 })).toBe('ok')
    expect(inv.getInstance(b.id)).toBeNull()
    expect(inv.getInstance(a.id)).not.toBeNull()
  })
})
