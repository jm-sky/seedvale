import { describe, expect, it } from 'vitest'
import { createHousehold } from '../settlement/household'
import {
  ARROWS_FROM_BEAM_PRODUCTION,
  ARROWS_FROM_BRANCH_PRODUCTION,
  BLACKSMITH_IRON_ROD_PRODUCTION,
} from './production'
import {
  isProductionShortagePersistent,
  PRODUCTION_SHORTAGE_PERSISTENCE_SEC,
  productionShortageKey,
} from './productionShortage'
import { createSettlementEconomy } from './settlementEconomy'

const DEMANDS = [
  { kind: 'wood' as const, target: 8 },
  { kind: 'food' as const, target: 6 },
  { kind: 'water' as const, target: 6 },
]

describe('production shortage (settlements-npcs-017)', () => {
  it('one transient blocked completion does not become persistent', () => {
    const eco = createSettlementEconomy('s1', { iron: 2 }, DEMANDS)
    const household = createHousehold('h', 's', 'home')
    eco.observeProductionOutcome(
      {
        ok: false,
        recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
        reason: 'insufficient-input',
        category: 'stock',
        kind: 'coal',
      },
      1,
    )
    const [row] = eco.productionShortages()
    expect(row).toMatchObject({ recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id, kind: 'coal' })
    expect(isProductionShortagePersistent(row!, 1)).toBe(false)
    expect(household.items.count('iron_rod')).toBe(0)
  })

  it('repeated blocking reuses one stable key', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    const blocked = {
      ok: false as const,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input' as const,
      category: 'stock' as const,
      kind: 'iron' as const,
    }
    eco.observeProductionOutcome(blocked, 0)
    eco.observeProductionOutcome(blocked, 5)
    eco.observeProductionOutcome(blocked, PRODUCTION_SHORTAGE_PERSISTENCE_SEC + 1)
    expect(eco.productionShortages()).toHaveLength(1)
    expect(isProductionShortagePersistent(eco.productionShortages()[0]!, PRODUCTION_SHORTAGE_PERSISTENCE_SEC + 1)).toBe(true)
    expect(productionShortageKey(eco.productionShortages()[0]!)).toBe(
      `${BLACKSMITH_IRON_ROD_PRODUCTION.id}|stock|iron|`,
    )
  })

  it('distinguishes missing iron from missing coal', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    eco.observeProductionOutcome({
      ok: false,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'stock',
      kind: 'iron',
    }, 0)
    eco.observeProductionOutcome({
      ok: false,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'stock',
      kind: 'coal',
    }, 0)
    const kinds = eco.productionShortages().map((row) => row.kind).sort()
    expect(kinds).toEqual(['coal', 'iron'])
  })

  it('does not duplicate the same settlement recipe per NPC', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    const blocked = {
      ok: false as const,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input' as const,
      category: 'stock' as const,
      kind: 'coal' as const,
    }
    eco.observeProductionOutcome(blocked, 2)
    eco.observeProductionOutcome(blocked, 3)
    expect(eco.productionShortages()).toHaveLength(1)
  })

  it('keeps household-scoped hunter shortages independent', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    const blocked = {
      ok: false as const,
      recipeId: ARROWS_FROM_BRANCH_PRODUCTION.id,
      reason: 'insufficient-input' as const,
      category: 'item' as const,
      kind: 'branch' as const,
    }
    eco.observeProductionOutcome(blocked, 0, 'h-a')
    eco.observeProductionOutcome(blocked, 0, 'h-b')
    expect(eco.productionShortages()).toHaveLength(2)
    expect(eco.productionShortages().map((row) => row.householdId).sort()).toEqual(['h-a', 'h-b'])
  })

  it('successful production clears the recipe shortage', () => {
    const eco = createSettlementEconomy('s1', { iron: 0, coal: 0 }, DEMANDS)
    eco.observeProductionOutcome({
      ok: false,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'stock',
      kind: 'coal',
    }, 0)
    eco.observeProductionOutcome({ ok: true, recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id }, 4)
    expect(eco.productionShortages()).toEqual([])
  })

  it('restoring live stock clears a stale shortage before another attempt', () => {
    const eco = createSettlementEconomy('s1', { iron: 2, coal: 1 }, DEMANDS, undefined, [{
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      category: 'stock',
      kind: 'coal',
      firstBlockedSimTime: 0,
      lastBlockedSimTime: 20,
    }])
    expect(eco.productionShortages()).toEqual([])
  })

  it('persists a still-valid shortage across snapshot restore', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    eco.observeProductionOutcome({
      ok: false,
      recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'stock',
      kind: 'iron',
    }, 3)
    const snapshot = eco.snapshot()
    expect(snapshot.productionShortages).toHaveLength(1)
    const restored = createSettlementEconomy(
      's1',
      snapshot.stock,
      DEMANDS,
      snapshot.food,
      snapshot.productionShortages,
    )
    expect(restored.productionShortages()).toMatchObject([{ kind: 'iron', recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id }])
  })

  it('does not collide hunter beam vs branch recipes', () => {
    const eco = createSettlementEconomy('s1', {}, DEMANDS)
    const household = createHousehold('h1', 's1', 'home')
    eco.observeProductionOutcome({
      ok: false,
      recipeId: ARROWS_FROM_BRANCH_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'item',
      kind: 'branch',
    }, 0, household.id)
    eco.observeProductionOutcome({
      ok: false,
      recipeId: ARROWS_FROM_BEAM_PRODUCTION.id,
      reason: 'insufficient-input',
      category: 'item',
      kind: 'beam',
    }, 0, household.id)
    expect(eco.productionShortages()).toHaveLength(2)
    household.items.add('branch', 1)
    eco.revalidateProductionShortages(1, { householdId: household.id, inventory: household.items })
    expect(eco.productionShortages().map((row) => row.kind)).toEqual(['beam'])
  })
})
