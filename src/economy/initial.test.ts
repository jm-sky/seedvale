import { describe, expect, it } from 'vitest'
import { demandsFor, initialStockFor, type SettlementEconomySeed } from './initial'

const seed = (id: string, size: SettlementEconomySeed['size'] = 'SM'): SettlementEconomySeed => ({
  id,
  size,
  foodSourceType: 'garden',
  familyCount: 2,
  dominantResource: null,
})

describe('initialStockFor', () => {
  it('is deterministic for the same settlement identity', () => {
    expect(initialStockFor(seed('0_0'))).toEqual(initialStockFor(seed('0_0')))
  })

  it('stays modest (no infinite depot)', () => {
    const stock = initialStockFor(seed('0_0', 'XL'))
    expect(stock.wood).toBeLessThan(10)
    expect(stock.food).toBeLessThan(10)
    expect(stock.water).toBe(4)
  })

  it('scales wood with village size', () => {
    const outpost = initialStockFor(seed('cell-a', 'OUTPOST'))
    const xl = initialStockFor(seed('cell-a', 'XL'))
    expect(xl.wood).toBeGreaterThan(outpost.wood!)
  })
})

describe('demandsFor', () => {
  it('always tracks wood, food and water', () => {
    const kinds = demandsFor(seed('0_0')).map((d) => d.kind)
    expect(kinds).toEqual(['wood', 'food', 'water'])
  })
})
