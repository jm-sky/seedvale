import { describe, expect, it } from 'vitest'
import {
  applyDerivedStaminaMax,
  resolveEnduranceStaminaRecoveryMultiplier,
  resolveMaxStaminaFromEndurance,
} from './enduranceStamina'
import { createStaminaState } from './StaminaState'

describe('resolveMaxStaminaFromEndurance (plan npc-021)', () => {
  const cases: readonly [number, number][] = [
    [0.00, 70],
    [0.25, 85],
    [0.50, 100],
    [0.60, 106],
    [0.75, 115],
    [1.00, 130],
  ]

  it.each(cases)('maps Endurance %s to max Stamina %s', (endurance, expectedMax) => {
    expect(resolveMaxStaminaFromEndurance(endurance)).toBeCloseTo(expectedMax, 10)
  })

  it('is monotonic across the full SPEA range', () => {
    let previous = resolveMaxStaminaFromEndurance(0)
    for (let e = 0.01; e <= 1; e += 0.01) {
      const next = resolveMaxStaminaFromEndurance(e)
      expect(next).toBeGreaterThanOrEqual(previous)
      previous = next
    }
  })
})

describe('resolveEnduranceStaminaRecoveryMultiplier (plan npc-021)', () => {
  const cases: readonly [number, number][] = [
    [0.00, 0.70],
    [0.25, 0.85],
    [0.50, 1.00],
    [0.60, 1.06],
    [0.75, 1.15],
    [1.00, 1.30],
  ]

  it.each(cases)('maps Endurance %s to recovery multiplier %s', (endurance, expectedMult) => {
    expect(resolveEnduranceStaminaRecoveryMultiplier(endurance)).toBeCloseTo(expectedMult, 10)
  })

  it('is monotonic across the full SPEA range', () => {
    let previous = resolveEnduranceStaminaRecoveryMultiplier(0)
    for (let e = 0.01; e <= 1; e += 0.01) {
      const next = resolveEnduranceStaminaRecoveryMultiplier(e)
      expect(next).toBeGreaterThanOrEqual(previous)
      previous = next
    }
  })
})

describe('applyDerivedStaminaMax (plan npc-021 runtime max semantics)', () => {
  it('clamps current when max decreases', () => {
    const stamina = createStaminaState(100)
    stamina.current = 80
    applyDerivedStaminaMax(stamina, 70)
    expect(stamina.max).toBe(70)
    expect(stamina.current).toBe(70)
  })

  it('does not refill current when max increases', () => {
    const stamina = createStaminaState(100)
    stamina.current = 60
    applyDerivedStaminaMax(stamina, 130)
    expect(stamina.max).toBe(130)
    expect(stamina.current).toBe(60)
  })

  it('preserves current when it is already below the new max', () => {
    const stamina = createStaminaState(100)
    stamina.current = 40
    applyDerivedStaminaMax(stamina, 106)
    expect(stamina.max).toBe(106)
    expect(stamina.current).toBe(40)
  })
})
