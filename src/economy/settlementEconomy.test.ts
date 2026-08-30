import { describe, expect, it } from 'vitest'
import { WOODSHED_DEVELOPMENT } from './development'
import { WOODCUTTING_PRODUCTION } from './production'
import { createSettlementEconomy } from './settlementEconomy'
import { EconomicStock } from './stock'

const DEMANDS = [
  { kind: 'wood' as const, target: 8 },
  { kind: 'food' as const, target: 6 },
  { kind: 'water' as const, target: 6 },
]

function economy(initial: Partial<Record<'water' | 'wood', number>> = {}) {
  return createSettlementEconomy('s1', initial, DEMANDS)
}

describe('EconomicStock add/remove', () => {
  it('adds and queries stock', () => {
    const stock = new EconomicStock({ wood: 3 })
    stock.add('wood', 2)
    expect(stock.query('wood')).toBe(5)
    expect(stock.query('food')).toBe(0)
  })

  it('cannot consume more than available', () => {
    const stock = new EconomicStock({ wood: 2 })
    expect(stock.remove('wood', 3)).toBe(false)
    expect(stock.query('wood')).toBe(2)
    expect(stock.remove('wood', 2)).toBe(true)
    expect(stock.query('wood')).toBe(0)
  })

  it('ignores non-positive add', () => {
    const stock = new EconomicStock({ wood: 1 })
    stock.add('wood', 0)
    stock.add('wood', -4)
    expect(stock.query('wood')).toBe(1)
  })
})

describe('production', () => {
  it('consumes inputs and adds outputs atomically', () => {
    const eco = economy({ wood: 4, water: 1 })
    const ok = eco.produce({
      id: 'test.mill',
      inputs: [{ kind: 'wood', amount: 2 }],
      outputs: [{ kind: 'water', amount: 3 }],
    })
    expect(ok).toBe(true)
    expect(eco.query('wood')).toBe(2)
    expect(eco.query('water')).toBe(4)
  })

  it('failed production does not partially consume inputs', () => {
    const eco = economy({ wood: 4, water: 0 })
    const ok = eco.produce({
      id: 'test.fail',
      inputs: [
        { kind: 'wood', amount: 2 },
        { kind: 'water', amount: 1 },
      ],
      outputs: [{ kind: 'iron', amount: 9 }],
    })
    expect(ok).toBe(false)
    expect(eco.query('wood')).toBe(4)
    expect(eco.query('water')).toBe(0)
    expect(eco.query('iron')).toBe(0)
  })

  it('woodcutting adds wood with no inputs', () => {
    const eco = economy({ wood: 1 })
    expect(eco.produce(WOODCUTTING_PRODUCTION)).toBe(true)
    expect(eco.query('wood')).toBe(3)
  })

  it('produce/reserve never touch food — no real production recipe targets it (plan settlements-npcs-008)', () => {
    const eco = economy({ wood: 4 })
    eco.depositFood('carrot', 2)
    eco.produce({ id: 'test.food-noop', inputs: [{ kind: 'wood', amount: 1 }], outputs: [{ kind: 'food', amount: 5 }] })
    expect(eco.query('food')).toBe(2)
  })
})

describe('shortage / surplus', () => {
  it('computes deficit and surplus against demand targets', () => {
    const eco = economy({ wood: 3, water: 10 })
    expect(eco.shortage('wood')).toBe(5)
    expect(eco.hasShortage('wood')).toBe(true)
    expect(eco.surplus('wood')).toBe(0)
    expect(eco.surplus('water')).toBe(4)
    expect(eco.hasSurplus('water')).toBe(true)
  })

  it('computes food deficit/surplus from concrete items, not a scalar (plan settlements-npcs-008)', () => {
    const eco = economy()
    expect(eco.shortage('food')).toBe(6)
    expect(eco.hasShortage('food')).toBe(true)
    eco.depositFood('carrot', 6)
    expect(eco.shortage('food')).toBe(0)
    expect(eco.hasShortage('food')).toBe(false)
    eco.depositFood('fish', 4)
    expect(eco.surplus('food')).toBe(4)
    expect(eco.hasSurplus('food')).toBe(true)
  })
})

describe('reserve / consume', () => {
  it('reserved goods leave available stock and can be released', () => {
    const eco = economy({ wood: 5 })
    const id = eco.reserve([{ kind: 'wood', amount: 3 }])
    expect(id).not.toBeNull()
    expect(eco.query('wood')).toBe(2)
    expect(eco.releaseReservation(id!)).toBe(true)
    expect(eco.query('wood')).toBe(5)
  })

  it('cannot reserve more than available', () => {
    const eco = economy({ wood: 2 })
    expect(eco.reserve([{ kind: 'wood', amount: 3 }])).toBeNull()
    expect(eco.query('wood')).toBe(2)
  })
})

describe('development', () => {
  it('can be reserved and paid once', () => {
    const eco = economy({ wood: 10 })
    expect(eco.reserveDevelopment(WOODSHED_DEVELOPMENT)).toBe(true)
    expect(eco.developmentStatus('woodshed')).toBe('reserved')
    expect(eco.query('wood')).toBe(4)
    expect(eco.payDevelopment(WOODSHED_DEVELOPMENT)).toBe(true)
    expect(eco.developmentStatus('woodshed')).toBe('complete')
    expect(eco.query('wood')).toBe(4)
    expect(eco.reserveDevelopment(WOODSHED_DEVELOPMENT)).toBe(false)
    expect(eco.payDevelopment(WOODSHED_DEVELOPMENT)).toBe(false)
  })

  it('cannot reserve development without enough stock', () => {
    const eco = economy({ wood: 2 })
    expect(eco.reserveDevelopment(WOODSHED_DEVELOPMENT)).toBe(false)
    expect(eco.developmentStatus('woodshed')).toBe('unmet')
    expect(eco.query('wood')).toBe(2)
  })
})

describe('settlement isolation', () => {
  it('settlements cannot affect each other\'s stock', () => {
    const a = createSettlementEconomy('a', { wood: 4 }, DEMANDS)
    const b = createSettlementEconomy('b', { wood: 1 }, DEMANDS)
    a.add('wood', 10)
    expect(a.query('wood')).toBe(14)
    expect(b.query('wood')).toBe(1)
    b.produce(WOODCUTTING_PRODUCTION)
    expect(a.query('wood')).toBe(14)
    expect(b.query('wood')).toBe(3)
  })
})

describe('raw ore stock (plan 131)', () => {
  it('accepts NPC-mined ore as settlement-level stock with no demand target', () => {
    const s = economy()
    s.add('iron', 1)
    s.add('iron', 2)
    s.add('coal', 1)
    expect(s.query('iron')).toBe(3)
    expect(s.query('coal')).toBe(1)
    expect(s.query('gold')).toBe(0)
    // No demand entry was registered for ore — shortage/surplus stay 0
    // rather than driving NPC decisions the way wood/food/water do.
    expect(s.shortage('iron')).toBe(0)
    expect(s.hasShortage('iron')).toBe(false)
  })
})
