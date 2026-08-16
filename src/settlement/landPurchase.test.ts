import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createLandOwnershipRegistry } from './landOwnership'
import { purchaseLandPlot, type LandPurchaseTarget } from './landPurchase'

function settlementWithPlot(price: number, plotId = 'plot-sale-0'): LandPurchaseTarget {
  return {
    id: 'settlement-0',
    landmarks: {
      landPlots: [{ plotId, position: new Vector3(0, 0, 0), rotation: 0, price }],
    },
  }
}

describe('purchaseLandPlot (plan 129 §10, §17.3)', () => {
  it('1000 coins, 500 price -> success, leaves 500', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 1000 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('ok')
    expect(inv.count('coin')).toBe(500)
    expect(ownership.isOwned('settlement-0', 'plot-sale-0')).toBe(true)
  })

  it('500 coins, 500 price -> success, leaves exactly 0', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 500 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('ok')
    expect(inv.count('coin')).toBe(0)
  })

  it('499 coins, 500 price -> cannot_afford, inventory/ownership unchanged', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 499 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('cannot_afford')
    expect(inv.count('coin')).toBe(499)
    expect(ownership.isOwned('settlement-0', 'plot-sale-0')).toBe(false)
  })

  it('no coins -> cannot_afford', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory()
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('cannot_afford')
  })

  it('already-owned plot rejects a second purchase, without touching inventory again', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 1000 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('ok')
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('already_owned')
    expect(inv.count('coin')).toBe(500)
  })

  it('price 0 is rejected as an invalid definition, not a free plot', () => {
    const settlement = settlementWithPlot(0)
    const inv = new Inventory({ coin: 1000 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)).toBe('invalid_price')
    expect(inv.count('coin')).toBe(1000)
  })

  it('unknown plot id -> not_found, inventory unchanged', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 1000 })
    const ownership = createLandOwnershipRegistry()
    expect(purchaseLandPlot(settlement, 'plot-sale-99', inv, ownership)).toBe('not_found')
    expect(inv.count('coin')).toBe(1000)
  })

  it('a failed purchase never leaves inventory or ownership partially mutated', () => {
    const settlement = settlementWithPlot(500)
    const inv = new Inventory({ coin: 100 })
    const ownership = createLandOwnershipRegistry()
    const before = inv.toJSON()
    purchaseLandPlot(settlement, 'plot-sale-0', inv, ownership)
    expect(inv.toJSON()).toEqual(before)
    expect(ownership.toJSON()).toEqual([])
  })
})
