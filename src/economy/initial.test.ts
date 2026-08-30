import { describe, expect, it } from 'vitest'
import { demandsFor, initialFoodFor, initialStockFor, type SettlementEconomySeed } from './initial'

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
    expect(stock.water).toBe(4)
  })

  it('never seeds a food key — food moved to initialFoodFor (plan settlements-npcs-008)', () => {
    const stock = initialStockFor(seed('0_0'))
    expect(stock.food).toBeUndefined()
  })

  it('scales wood with village size', () => {
    const outpost = initialStockFor(seed('cell-a', 'OUTPOST'))
    const xl = initialStockFor(seed('cell-a', 'XL'))
    expect(xl.wood).toBeGreaterThan(outpost.wood!)
  })
})

describe('initialFoodFor', () => {
  it('is deterministic for the same settlement identity', () => {
    expect(initialFoodFor(seed('0_0'))).toEqual(initialFoodFor(seed('0_0')))
  })

  it('seeds a modest amount of a concrete food ItemKind, not an abstract number', () => {
    const food = initialFoodFor(seed('0_0'))
    expect(food.bread).toBeGreaterThan(0)
    expect(food.bread).toBeLessThan(10)
  })

  it('gives a small bonus for fertile-soil/fish dominant resources', () => {
    const plain = initialFoodFor(seed('same-id'))
    const bonus = initialFoodFor({
      ...seed('same-id'),
      dominantResource: { id: 'r', type: 'fertile_soil', x: 0, z: 0, radius: 10, richness: 1 },
    })
    expect(bonus.bread).toBeGreaterThan(plain.bread!)
  })
})

describe('demandsFor', () => {
  it('always tracks wood, food and water', () => {
    const kinds = demandsFor(seed('0_0')).map((d) => d.kind)
    expect(kinds).toEqual(['wood', 'food', 'water'])
  })
})
