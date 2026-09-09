import { describe, expect, it } from 'vitest'
import type { NpcDecisionTarget } from './weatherPressure'
import { Inventory } from '../items/Inventory'
import { resolveInjurySeverity } from '../shared/injurySeverity'
import { pickActionKind } from '../simulation'
import {
  decreaseInjuryFromHeal,
  healingPressure,
  increaseInjuryFromDamage,
} from './healingPressure'
import { createNeedState, generateNeedPressures, type NeedState } from './Needs'

describe('healingPressure (plan npc-025)', () => {
  it('is 0 with no injury, even with a suitable treatment on hand', () => {
    expect(healingPressure(0, 100, true)).toBe(0)
  })

  it('is 0 with an injury but no suitable treatment (no candidate without medicine)', () => {
    expect(healingPressure(40, 100, false)).toBe(0)
    expect(healingPressure(80, 100, false)).toBe(0)
  })

  it('uses derived severity rather than a second injury-band cutoff', () => {
    expect(resolveInjurySeverity(1, 100)).toBe('minor')
    expect(healingPressure(1, 100, true)).toBeGreaterThan(0)
    expect(healingPressure(1, 100, true)).toBeLessThan(healingPressure(40, 100, true))
  })

  it('grows with severity and stays bounded to [0, 1]', () => {
    const minor = healingPressure(20, 100, true)
    const serious = healingPressure(40, 100, true)
    const critical = healingPressure(80, 100, true)
    expect(minor).toBeGreaterThan(0)
    expect(serious).toBeGreaterThan(minor)
    expect(critical).toBeGreaterThan(serious)
    expect(critical).toBeLessThanOrEqual(1)
  })

  it('is deterministic for identical inputs', () => {
    expect(healingPressure(30, 100, true)).toBe(healingPressure(30, 100, true))
  })
})

describe('injury accounting re-exports', () => {
  it('increaseInjuryFromDamage adds the actual HP loss', () => {
    expect(increaseInjuryFromDamage(0, 15)).toBe(15)
    expect(increaseInjuryFromDamage(10, 5)).toBe(15)
  })

  it('decreaseInjuryFromHeal subtracts the actual HP restored', () => {
    expect(decreaseInjuryFromHeal(20, 8)).toBe(12)
    expect(decreaseInjuryFromHeal(5, 35)).toBe(0)
  })
})

/** Mirrors `NpcAgent.choose()`'s own arbitration composition (append
 *  `seekShelter`/`heal` candidates to the existing need-pressure list, then
 *  `pickActionKind` over all of them) — verified here as a pure function so
 *  healing vs. need competition doesn't require constructing a real
 *  `NpcAgent` (same idiom as `weatherPressure.test.ts`'s `decide`). */
function decide(needs: NeedState, healPressure: number): NpcDecisionTarget {
  const pressures = generateNeedPressures(needs)
  return pickActionKind<NpcDecisionTarget>(
    [
      ...pressures.map((p) => ({ kind: p.target, score: p.value })),
      { kind: 'seekShelter', score: 0 },
      { kind: 'heal', score: healPressure },
    ],
    'idle',
  )
}

describe('healing vs. need arbitration (mirrors NpcAgent.choose())', () => {
  it('lets a serious, treated injury win over a fresh NPC\'s idle baseline', () => {
    const serious = healingPressure(40, 100, true)
    expect(decide(createNeedState(), serious)).toBe('heal')
  })

  it('lets critical treated injury suppress ordinary idle/work pressure', () => {
    expect(decide(createNeedState(), healingPressure(80, 100, true))).toBe('heal')
  })

  it('still lets a genuinely urgent physiological need win over healing pressure', () => {
    const needs = createNeedState()
    needs.thirst = 0.95
    const critical = healingPressure(80, 100, true)
    expect(decide(needs, critical)).toBe('water')
  })

  it('lets minor injury lose to a higher-priority need', () => {
    const needs = createNeedState()
    needs.hunger = 0.9
    expect(decide(needs, healingPressure(12, 100, true))).toBe('food')
  })

  it('does not create a feasible heal candidate from an herb-only inventory', () => {
    const herbs = new Inventory({ herb: 2 })
    const severity = resolveInjurySeverity(40, 100)
    expect(herbs.findInjuryTreatment(severity)).toBeNull()
    expect(healingPressure(40, 100, herbs.findInjuryTreatment(severity) != null)).toBe(0)
    expect(decide(createNeedState(), 0)).not.toBe('heal')
  })
})
