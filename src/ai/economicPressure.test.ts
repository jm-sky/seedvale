import { describe, expect, it } from 'vitest'
import type { NpcDecisionTarget } from './weatherPressure'
import {
  isProductionShortagePersistent,
  PRODUCTION_SHORTAGE_PERSISTENCE_SEC,
  type ProductionShortageRecord,
} from '../economy/productionShortage'
import { pickActionKind } from '../simulation/scoreActions'
import { productionShortagePressures } from './economicPressure'
import { createNeedState, generateNeedPressures } from './Needs'

const coalShortage = (first: number, last = first): ProductionShortageRecord => ({
  recipeId: 'blacksmith.iron_rod',
  category: 'stock',
  kind: 'coal',
  firstBlockedSimTime: first,
  lastBlockedSimTime: last,
})

describe('productionShortagePressures (settlements-npcs-017)', () => {
  it('is 0 before the persistence threshold', () => {
    const [pressure] = productionShortagePressures([coalShortage(0)], 1)
    expect(pressure).toBeUndefined()
    expect(isProductionShortagePersistent(coalShortage(0), 1)).toBe(false)
  })

  it('becomes visible after the persistence threshold', () => {
    const now = PRODUCTION_SHORTAGE_PERSISTENCE_SEC
    const pressures = productionShortagePressures([coalShortage(0, now)], now)
    expect(pressures).toHaveLength(1)
    expect(pressures[0]?.source).toBe('economy.productionShortage.blacksmith.iron_rod.coal')
    expect(pressures[0]?.target).toBe('idle')
    expect(pressures[0]?.value).toBeGreaterThan(0)
    expect(pressures[0]?.value).toBeLessThanOrEqual(1)
  })

  it('hides another household\'s item shortage', () => {
    const now = PRODUCTION_SHORTAGE_PERSISTENCE_SEC
    const record: ProductionShortageRecord = {
      recipeId: 'hunter.arrows.branch',
      category: 'item',
      kind: 'branch',
      householdId: 'h-a',
      firstBlockedSimTime: 0,
      lastBlockedSimTime: now,
    }
    expect(productionShortagePressures([record], now, 'h-b')).toEqual([])
    expect(productionShortagePressures([record], now, 'h-a')).toHaveLength(1)
  })

  it('does not win pickActionKind against a real need', () => {
    const needs = createNeedState(0)
    needs.thirst = 0.9
    const needPressures = generateNeedPressures(needs)
    const economic = productionShortagePressures(
      [coalShortage(0, PRODUCTION_SHORTAGE_PERSISTENCE_SEC)],
      PRODUCTION_SHORTAGE_PERSISTENCE_SEC,
    )
    const decision = pickActionKind<NpcDecisionTarget>(
      [
        ...needPressures.map((p) => ({ kind: p.target, score: p.value })),
        { kind: 'seekShelter', score: 0 },
      ],
      'idle',
    )
    expect(decision).toBe('water')
    expect(economic[0]?.target).toBe('idle')
  })
})
