import { describe, expect, it } from 'vitest'
import { applyMeleeStrength, MELEE_STRENGTH_NEUTRAL, meleeStrengthMultiplier } from './meleeStrength'

describe('meleeStrengthMultiplier', () => {
  it('maps the documented boundary/neutral points exactly (plan npc-019 §8)', () => {
    expect(meleeStrengthMultiplier(0)).toBeCloseTo(0.70, 5)
    expect(meleeStrengthMultiplier(0.25)).toBeCloseTo(0.85, 5)
    expect(meleeStrengthMultiplier(0.5)).toBeCloseTo(1.00, 5)
    expect(meleeStrengthMultiplier(0.75)).toBeCloseTo(1.15, 5)
    expect(meleeStrengthMultiplier(1)).toBeCloseTo(1.30, 5)
  })

  it('is neutral at MELEE_STRENGTH_NEUTRAL', () => {
    expect(meleeStrengthMultiplier(MELEE_STRENGTH_NEUTRAL)).toBeCloseTo(1.0, 5)
  })
})

describe('applyMeleeStrength', () => {
  it('preserves legacy damage exactly at Strength 0.5', () => {
    expect(applyMeleeStrength(40, 0.5)).toBeCloseTo(40, 5)
  })

  it('scales damage down/up at the documented boundaries', () => {
    expect(applyMeleeStrength(10, 0)).toBeCloseTo(7, 5)
    expect(applyMeleeStrength(10, 1)).toBeCloseTo(13, 5)
  })
})
