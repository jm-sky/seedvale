import { describe, expect, it } from 'vitest'
import type { NpcDecisionTarget } from './weatherPressure'
import { pickActionKind } from '../simulation'
import {
  decreaseInjuryFromHeal,
  healingPressure,
  increaseInjuryFromDamage,
} from './healingPressure'
import { createNeedState, generateNeedPressures, type NeedState } from './Needs'

describe('healingPressure', () => {
  it('is 0 with no injury, even with a consumable on hand', () => {
    expect(healingPressure(0, 100, true)).toBe(0)
  })

  it('is 0 with an injury but no health consumable (no candidate without medicine)', () => {
    expect(healingPressure(40, 100, false)).toBe(0)
  })

  it('is 0 for a scratch below the minimum-severity floor', () => {
    expect(healingPressure(1, 100, true)).toBe(0)
  })

  it('grows with severity once past the floor, and stays bounded to [0, 1]', () => {
    const moderate = healingPressure(20, 100, true)
    const severe = healingPressure(80, 100, true)
    expect(moderate).toBeGreaterThan(0)
    expect(severe).toBeGreaterThan(moderate)
    expect(severe).toBeLessThanOrEqual(1)
  })

  it('is deterministic for identical inputs', () => {
    expect(healingPressure(30, 100, true)).toBe(healingPressure(30, 100, true))
  })
})

describe('injury accounting deltas', () => {
  it('increaseInjuryFromDamage adds the actual HP loss', () => {
    expect(increaseInjuryFromDamage(0, 15)).toBe(15)
    expect(increaseInjuryFromDamage(10, 5)).toBe(15)
  })

  it('increaseInjuryFromDamage no-ops for a non-positive loss', () => {
    expect(increaseInjuryFromDamage(10, 0)).toBe(10)
    expect(increaseInjuryFromDamage(10, -5)).toBe(10)
  })

  it('decreaseInjuryFromHeal subtracts the actual HP restored', () => {
    expect(decreaseInjuryFromHeal(20, 8)).toBe(12)
  })

  it('decreaseInjuryFromHeal clamps an over-heal at 0', () => {
    expect(decreaseInjuryFromHeal(5, 35)).toBe(0)
  })

  it('decreaseInjuryFromHeal no-ops for a non-positive restore', () => {
    expect(decreaseInjuryFromHeal(10, 0)).toBe(10)
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
  it('lets a serious, medicated injury win over a fresh NPC\'s idle baseline', () => {
    const severe = healingPressure(80, 100, true)
    expect(decide(createNeedState(), severe)).toBe('heal')
  })

  it('still lets a genuinely urgent physiological need win over healing pressure', () => {
    const needs = createNeedState()
    needs.thirst = 0.95
    const severe = healingPressure(80, 100, true)
    expect(decide(needs, severe)).toBe('water')
  })
})
