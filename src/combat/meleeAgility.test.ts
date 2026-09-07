import { describe, expect, it } from 'vitest'
import { MELEE_AGILITY_NEUTRAL, meleeRecoveryMultiplier, resolveMeleeRecovery } from './meleeAgility'

describe('meleeRecoveryMultiplier', () => {
  it('maps the documented boundary/neutral points exactly (plan npc-022)', () => {
    expect(meleeRecoveryMultiplier(0)).toBeCloseTo(1.20, 5)
    expect(meleeRecoveryMultiplier(0.5)).toBeCloseTo(1.00, 5)
    expect(meleeRecoveryMultiplier(0.6)).toBeCloseTo(0.96, 5)
    expect(meleeRecoveryMultiplier(1)).toBeCloseTo(0.80, 5)
  })

  it('is neutral at MELEE_AGILITY_NEUTRAL', () => {
    expect(meleeRecoveryMultiplier(MELEE_AGILITY_NEUTRAL)).toBeCloseTo(1.0, 5)
  })

  it('shortens recovery above neutral and lengthens it below neutral', () => {
    expect(meleeRecoveryMultiplier(0.7)).toBeLessThan(1.0)
    expect(meleeRecoveryMultiplier(0.3)).toBeGreaterThan(1.0)
  })

  it('clamps out-of-range inputs to the documented bounds', () => {
    expect(meleeRecoveryMultiplier(-1)).toBeCloseTo(1.20, 5)
    expect(meleeRecoveryMultiplier(2)).toBeCloseTo(0.80, 5)
  })
})

describe('resolveMeleeRecovery', () => {
  it('preserves base recovery exactly at Agility 0.5', () => {
    expect(resolveMeleeRecovery(1.2, 0.5)).toBeCloseTo(1.2, 5)
  })

  it('scales recovery down/up at the documented boundaries', () => {
    expect(resolveMeleeRecovery(1.0, 0)).toBeCloseTo(1.20, 5)
    expect(resolveMeleeRecovery(1.0, 1)).toBeCloseTo(0.80, 5)
  })

  it('never collapses to zero or negative recovery for a positive base', () => {
    for (let agility = 0; agility <= 1; agility += 0.1) {
      expect(resolveMeleeRecovery(1.0, agility)).toBeGreaterThan(0)
    }
  })
})
