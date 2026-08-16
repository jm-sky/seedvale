import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { ITEM_CATALOG } from './itemCatalog'
import { ITEM_DEFS } from './items'

describe('coin (plan 129)', () => {
  it('exists in the item catalog as a normal, non-spawned, non-holdable resource', () => {
    expect(ITEM_DEFS.coin).toBeDefined()
    expect(ITEM_DEFS.coin.category).toBe('resource')
    expect(ITEM_CATALOG.coin.spawn).toBe('none')
    expect(ITEM_CATALOG.coin.holdable).toBe(false)
    expect(ITEM_CATALOG.coin.melee).toBeNull()
  })

  it('stacks through the normal Inventory counter', () => {
    const inv = new Inventory()
    inv.add('coin', 500)
    inv.add('coin', 250)
    expect(inv.count('coin')).toBe(750)
  })

  it('can remove exactly the current balance, leaving zero', () => {
    const inv = new Inventory({ coin: 500 })
    expect(inv.remove('coin', 500)).toBe(true)
    expect(inv.count('coin')).toBe(0)
  })

  it('refuses to remove more than the current balance, without mutating it', () => {
    const inv = new Inventory({ coin: 499 })
    expect(inv.remove('coin', 500)).toBe(false)
    expect(inv.count('coin')).toBe(499)
  })

  it('has a near-zero weight so a land-plot price does not blow the carry limit', () => {
    const inv = new Inventory()
    expect(inv.canAdd('coin', 3000)).toBe(true)
  })
})
