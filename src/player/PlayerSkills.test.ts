import { describe, expect, it } from 'vitest'
import {
  applySneakSpeedModifier,
  createPlayerSkills,
  SNEAK_FIXED_VALUE,
  SNEAK_SPEED_MULTIPLIER,
  toggleSneak,
} from './PlayerSkills'

describe('createPlayerSkills', () => {
  it('starts with sneak fixed at 0.5 and inactive', () => {
    const skills = createPlayerSkills()
    expect(skills.sneak.value).toBe(SNEAK_FIXED_VALUE)
    expect(skills.sneak.value).toBe(0.5)
    expect(skills.sneak.active).toBe(false)
  })
})

describe('toggleSneak', () => {
  it('flips active on and off without touching value', () => {
    const skills = createPlayerSkills()
    toggleSneak(skills)
    expect(skills.sneak.active).toBe(true)
    expect(skills.sneak.value).toBe(SNEAK_FIXED_VALUE)
    toggleSneak(skills)
    expect(skills.sneak.active).toBe(false)
  })
})

describe('applySneakSpeedModifier', () => {
  it('leaves speed unchanged when inactive', () => {
    expect(applySneakSpeedModifier(8, false)).toBe(8)
  })

  it('slows speed by 30-50% when active (plan 124 §3)', () => {
    const result = applySneakSpeedModifier(8, true)
    expect(result).toBeCloseTo(8 * SNEAK_SPEED_MULTIPLIER)
    expect(result).toBeLessThanOrEqual(8 * 0.7)
    expect(result).toBeGreaterThanOrEqual(8 * 0.5)
  })

  it('applies the same multiplier regardless of the base speed (walk vs sprint)', () => {
    const walk = applySneakSpeedModifier(8, true)
    const sprint = applySneakSpeedModifier(8 * 1.8, true)
    expect(sprint / (8 * 1.8)).toBeCloseTo(walk / 8)
  })
})
