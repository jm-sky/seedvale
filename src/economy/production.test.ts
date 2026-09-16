import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import {
  ARROWS_FROM_BEAM_PRODUCTION,
  ARROWS_FROM_BRANCH_PRODUCTION,
  householdTradeBowCount,
  HUNTER_ARROW_PRODUCTIONS,
  HUNTER_BOW_PRODUCTIONS,
  HUNTER_BOW_STOCK_CAP,
  produceFirstAvailableItemRecipe,
  SHORT_BOW_FROM_BEAM_PRODUCTION,
  SHORT_BOW_FROM_BRANCH_PRODUCTION,
} from './production'

describe('hunter arrow productions (settlements-npcs-003)', () => {
  it('1 branch -> 1 arrow', () => {
    const inv = new Inventory({ branch: 1 }, Infinity)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    expect(applied).toBe(ARROWS_FROM_BRANCH_PRODUCTION)
    expect(inv.count('branch')).toBe(0)
    expect(inv.count('arrow')).toBe(1)
  })

  it('1 beam -> 8 arrows', () => {
    const inv = new Inventory({ beam: 1 }, Infinity)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    expect(applied).toBe(ARROWS_FROM_BEAM_PRODUCTION)
    expect(inv.count('beam')).toBe(0)
    expect(inv.count('arrow')).toBe(8)
  })

  it('prefers branch over beam when both are available', () => {
    const inv = new Inventory({ branch: 1, beam: 1 }, Infinity)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    expect(applied).toBe(ARROWS_FROM_BRANCH_PRODUCTION)
    expect(inv.count('branch')).toBe(0)
    expect(inv.count('beam')).toBe(1)
    expect(inv.count('arrow')).toBe(1)
  })

  it('is deterministic across repeated calls with the same stock', () => {
    const results = Array.from({ length: 5 }, () => {
      const inv = new Inventory({ branch: 2, beam: 2 }, Infinity)
      return produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    })
    expect(results.every((r) => r === ARROWS_FROM_BRANCH_PRODUCTION)).toBe(true)
  })

  it('no material available blocks production', () => {
    const inv = new Inventory({}, Infinity)
    expect(produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)).toBeNull()
    expect(inv.count('arrow')).toBe(0)
  })

  it('input material is actually consumed, not just output granted', () => {
    const inv = new Inventory({ branch: 3 }, Infinity)
    produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    expect(inv.count('branch')).toBe(2)
  })

  it('a single beam recipe can push arrow stock past a stock-start threshold (plan §7)', () => {
    // Mirrors the cap being a *start* threshold, not a hard output limit —
    // 9/10 + beam -> 17/10 is expected to succeed in full.
    const cap = 10
    const inv = new Inventory({ arrow: 9, beam: 1 }, Infinity)
    expect(inv.count('arrow')).toBeLessThan(cap)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_ARROW_PRODUCTIONS)
    expect(applied).toBe(ARROWS_FROM_BEAM_PRODUCTION)
    expect(inv.count('arrow')).toBe(17)
    expect(inv.count('arrow')).toBeGreaterThan(cap)
  })
})

describe('hunter bow productions (plan settlements-npcs-040)', () => {
  it('2 branch -> 1 short_bow', () => {
    const inv = new Inventory({ branch: 2 }, Infinity)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_BOW_PRODUCTIONS)
    expect(applied).toBe(SHORT_BOW_FROM_BRANCH_PRODUCTION)
    expect(inv.count('branch')).toBe(0)
    expect(inv.count('short_bow')).toBe(1)
  })

  it('1 beam -> 1 short_bow', () => {
    const inv = new Inventory({ beam: 1 }, Infinity)
    const applied = produceFirstAvailableItemRecipe(inv, HUNTER_BOW_PRODUCTIONS)
    expect(applied).toBe(SHORT_BOW_FROM_BEAM_PRODUCTION)
    expect(inv.count('beam')).toBe(0)
    expect(inv.count('short_bow')).toBe(1)
  })

  it('prefers branch over beam when both are available', () => {
    const inv = new Inventory({ branch: 2, beam: 1 }, Infinity)
    expect(produceFirstAvailableItemRecipe(inv, HUNTER_BOW_PRODUCTIONS)).toBe(SHORT_BOW_FROM_BRANCH_PRODUCTION)
    expect(inv.count('beam')).toBe(1)
  })

  it('blocks when wood is insufficient', () => {
    const inv = new Inventory({ branch: 1 }, Infinity)
    expect(produceFirstAvailableItemRecipe(inv, HUNTER_BOW_PRODUCTIONS)).toBeNull()
    expect(inv.count('short_bow')).toBe(0)
    expect(inv.count('branch')).toBe(1)
  })

  it('counts stack short_bow and instance hunting_bow toward the trade cap', () => {
    const inv = new Inventory({ short_bow: 1 }, Infinity, [{ id: 'bow-1', kind: 'hunting_bow' }])
    expect(householdTradeBowCount(inv)).toBe(HUNTER_BOW_STOCK_CAP)
  })
})
