import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createHousehold } from '../settlement/household'
import {
  ARROWS_FROM_BEAM_PRODUCTION,
  ARROWS_FROM_BRANCH_PRODUCTION,
  FARMING_PRODUCTION,
  HUNTER_ARROW_PRODUCTIONS,
  produceFirstAvailableItemRecipe,
  type ProductionDef,
  WOODCUTTING_PRODUCTION,
} from './production'
import { executeProduction } from './productionExecutor'
import { createSettlementEconomy } from './settlementEconomy'

const DEMANDS = [
  { kind: 'wood' as const, target: 8 },
  { kind: 'food' as const, target: 6 },
  { kind: 'water' as const, target: 6 },
]

function economy(initial: Partial<Record<'coal' | 'iron' | 'water' | 'wood', number>> = {}) {
  return createSettlementEconomy('s1', initial, DEMANDS)
}

const MIXED_ROD: ProductionDef = {
  id: 'test.blacksmith.rod',
  inputs: [
    { kind: 'iron', amount: 2 },
    { kind: 'coal', amount: 1 },
  ],
  outputs: [],
  itemOutputs: [{ kind: 'iron_rod', amount: 1 }],
}

describe('executeProduction (settlements-npcs-015)', () => {
  it('commits a stock-only recipe with exact quantities', () => {
    const eco = economy({ wood: 4, water: 1 })
    const result = executeProduction({
      id: 'test.mill',
      inputs: [{ kind: 'wood', amount: 2 }],
      outputs: [{ kind: 'water', amount: 3 }],
    }, { economy: eco, simTime: 4 })
    expect(result).toEqual({ ok: true, recipeId: 'test.mill' })
    expect(eco.query('wood')).toBe(2)
    expect(eco.query('water')).toBe(4)
  })

  it('commits an item-only recipe with exact quantities', () => {
    const inventory = new Inventory({ branch: 1 }, Infinity)
    const result = executeProduction(ARROWS_FROM_BRANCH_PRODUCTION, { inventory })
    expect(result.ok).toBe(true)
    expect(inventory.count('branch')).toBe(0)
    expect(inventory.count('arrow')).toBe(1)
  })

  it('commits a mixed stock → item recipe', () => {
    const eco = economy({ iron: 2, coal: 1 })
    const inventory = new Inventory({}, Infinity)
    const result = executeProduction(MIXED_ROD, { economy: eco, inventory, simTime: 9 })
    expect(result).toEqual({ ok: true, recipeId: MIXED_ROD.id })
    expect(eco.query('iron')).toBe(0)
    expect(eco.query('coal')).toBe(0)
    expect(inventory.count('iron_rod')).toBe(1)
  })

  it('missing stock leaves the item owner unchanged', () => {
    const eco = economy({ iron: 1, coal: 1 })
    const inventory = new Inventory({ branch: 3 }, Infinity)
    const result = executeProduction(MIXED_ROD, { economy: eco, inventory })
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-input', category: 'stock', kind: 'iron' })
    expect(eco.query('iron')).toBe(1)
    expect(eco.query('coal')).toBe(1)
    expect(inventory.count('branch')).toBe(3)
    expect(inventory.count('iron_rod')).toBe(0)
  })

  it('missing item input leaves stock unchanged', () => {
    const eco = economy({ wood: 4 })
    const inventory = new Inventory({}, Infinity)
    const result = executeProduction({
      id: 'test.item-in',
      inputs: [{ kind: 'wood', amount: 1 }],
      outputs: [],
      itemInputs: [{ kind: 'branch', amount: 1 }],
      itemOutputs: [{ kind: 'arrow', amount: 1 }],
    }, { economy: eco, inventory })
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-input', category: 'item', kind: 'branch' })
    expect(eco.query('wood')).toBe(4)
    expect(inventory.count('arrow')).toBe(0)
  })

  it('aggregates duplicate stock inputs and does not partially consume', () => {
    const eco = economy({ wood: 3 })
    const result = executeProduction({
      id: 'test.dup-stock',
      inputs: [{ kind: 'wood', amount: 2 }, { kind: 'wood', amount: 2 }],
      outputs: [{ kind: 'iron', amount: 1 }],
    }, { economy: eco })
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-input', category: 'stock', kind: 'wood' })
    expect(eco.query('wood')).toBe(3)
    expect(eco.query('iron')).toBe(0)
  })

  it('aggregates duplicate item inputs and does not partially consume', () => {
    const inventory = new Inventory({ branch: 1 }, Infinity)
    const result = executeProduction({
      id: 'test.dup-item',
      inputs: [],
      outputs: [],
      itemInputs: [{ kind: 'branch', amount: 1 }, { kind: 'branch', amount: 1 }],
      itemOutputs: [{ kind: 'arrow', amount: 1 }],
    }, { inventory })
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-input', category: 'item', kind: 'branch' })
    expect(inventory.count('branch')).toBe(1)
    expect(inventory.count('arrow')).toBe(0)
  })

  it('aggregates duplicate outputs before destination preflight', () => {
    const inventory = new Inventory({}, 5)
    const result = executeProduction({
      id: 'test.dup-out',
      inputs: [],
      outputs: [],
      itemOutputs: [{ kind: 'stone', amount: 3 }, { kind: 'stone', amount: 3 }],
    }, { inventory })
    expect(result).toMatchObject({ ok: false, reason: 'unavailable-destination', category: 'item' })
    expect(inventory.count('stone')).toBe(0)
  })

  it('rejects non-finite and negative quantities with zero mutation', () => {
    const eco = economy({ wood: 4 })
    const inventory = new Inventory({ branch: 1 }, Infinity)
    for (const amount of [NaN, Infinity, -Infinity, -2]) {
      const result = executeProduction({
        id: 'test.bad-amount',
        inputs: [{ kind: 'wood', amount }],
        outputs: [],
        itemOutputs: [{ kind: 'arrow', amount: 1 }],
      }, { economy: eco, inventory })
      expect(result).toMatchObject({ ok: false, reason: 'invalid-recipe' })
    }
    expect(eco.query('wood')).toBe(4)
    expect(inventory.count('branch')).toBe(1)
    expect(inventory.count('arrow')).toBe(0)
  })

  it('normalizes zero rows away so they do not require owners', () => {
    const result = executeProduction({
      id: 'test.zeros',
      inputs: [{ kind: 'wood', amount: 0 }],
      outputs: [{ kind: 'iron', amount: 0 }],
      itemInputs: [{ kind: 'branch', amount: 0 }],
      itemOutputs: [{ kind: 'arrow', amount: 0 }],
    })
    expect(result).toEqual({ ok: true, recipeId: 'test.zeros' })
  })

  it('fails when a required stock owner is missing', () => {
    const result = executeProduction(WOODCUTTING_PRODUCTION)
    expect(result).toMatchObject({ ok: false, reason: 'unavailable-destination', category: 'stock' })
  })

  it('fails when a required item owner is missing', () => {
    const eco = economy({ iron: 2, coal: 1 })
    const result = executeProduction(MIXED_ROD, { economy: eco })
    expect(result).toMatchObject({ ok: false, reason: 'unavailable-destination', category: 'item' })
    expect(eco.query('iron')).toBe(2)
    expect(eco.query('coal')).toBe(1)
  })

  it('rejects stock kind food before consuming any other input', () => {
    const eco = economy({ wood: 4 })
    eco.depositFood('carrot', 2)
    const result = executeProduction({
      id: 'test.food-stock',
      inputs: [{ kind: 'wood', amount: 1 }],
      outputs: [{ kind: 'food', amount: 5 }],
    }, { economy: eco })
    expect(result).toMatchObject({ ok: false, reason: 'invalid-recipe', category: 'stock', kind: 'food' })
    expect(eco.query('wood')).toBe(4)
    expect(eco.query('food')).toBe(2)
  })

  it('empty placeholder recipes succeed without mutating owners', () => {
    const eco = economy({ wood: 2 })
    const result = executeProduction(FARMING_PRODUCTION, { economy: eco })
    expect(result).toEqual({ ok: true, recipeId: FARMING_PRODUCTION.id })
    expect(eco.query('wood')).toBe(2)
  })

  it('records stock.removed / stock.added history at the supplied simTime', () => {
    const eco = economy({ wood: 4 })
    executeProduction({
      id: 'test.history',
      inputs: [{ kind: 'wood', amount: 2 }],
      outputs: [{ kind: 'iron', amount: 1 }],
    }, { economy: eco, simTime: 11 })
    expect(eco.history()).toEqual([
      expect.objectContaining({ type: 'stock.removed', kind: 'wood', amount: 2, simTime: 11 }),
      expect.objectContaining({ type: 'stock.added', kind: 'iron', amount: 1, simTime: 11 }),
    ])
  })

  it('revalidates live state on a second sequential call', () => {
    const eco = economy({ wood: 2 })
    const def: ProductionDef = {
      id: 'test.once',
      inputs: [{ kind: 'wood', amount: 2 }],
      outputs: [{ kind: 'iron', amount: 1 }],
    }
    expect(executeProduction(def, { economy: eco }).ok).toBe(true)
    expect(eco.query('iron')).toBe(1)
    const second = executeProduction(def, { economy: eco })
    expect(second).toMatchObject({ ok: false, reason: 'insufficient-input', category: 'stock', kind: 'wood' })
    expect(eco.query('wood')).toBe(0)
    expect(eco.query('iron')).toBe(1)
  })

  it('produces each output exactly once', () => {
    const eco = economy()
    executeProduction(WOODCUTTING_PRODUCTION, { economy: eco })
    expect(eco.query('wood')).toBe(2)
    expect(eco.history().filter((e) => e.type === 'stock.added')).toHaveLength(1)
  })
})

describe('produceFirstAvailableItemRecipe / hunter (settlements-npcs-015)', () => {
  it('still prefers branch over beam and keeps 1→1 / 1→8 quantities', () => {
    const both = new Inventory({ branch: 1, beam: 1 }, Infinity)
    expect(produceFirstAvailableItemRecipe(both, HUNTER_ARROW_PRODUCTIONS)).toBe(ARROWS_FROM_BRANCH_PRODUCTION)
    expect(both.count('arrow')).toBe(1)
    expect(both.count('beam')).toBe(1)

    const beamOnly = new Inventory({ beam: 1 }, Infinity)
    expect(produceFirstAvailableItemRecipe(beamOnly, HUNTER_ARROW_PRODUCTIONS)).toBe(ARROWS_FROM_BEAM_PRODUCTION)
    expect(beamOnly.count('arrow')).toBe(8)
  })

  it('can push arrows past the start-threshold cap in one completion', () => {
    const inv = new Inventory({ arrow: 23, beam: 1 }, Infinity)
    expect(produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)).toBe(ARROWS_FROM_BEAM_PRODUCTION)
    expect(inv.count('arrow')).toBe(31)
  })
})

describe('SettlementEconomy.produce stock-only adapter', () => {
  it('routes through the shared executor and records history', () => {
    const eco = economy({ wood: 1 })
    expect(eco.produce(WOODCUTTING_PRODUCTION, 6)).toBe(true)
    expect(eco.query('wood')).toBe(3)
    expect(eco.history()[0]).toMatchObject({ type: 'stock.added', kind: 'wood', amount: 2, simTime: 6 })
  })

  it('does not look up a household item destination', () => {
    const eco = economy({ iron: 2, coal: 1 })
    const household = createHousehold('h', 's', 'home')
    expect(eco.produce(MIXED_ROD)).toBe(false)
    expect(eco.query('iron')).toBe(2)
    expect(household.items.count('iron_rod')).toBe(0)
  })
})
