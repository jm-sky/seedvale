import { describe, expect, it } from 'vitest'
import {
  accumulateSneakUse,
  applySneakSpeedModifier,
  awardSkillXp,
  createPlayerSkills,
  restorePersistedSkills,
  SKILL_MIN_VALUE,
  SKILL_XP_AWARD,
  SNEAK_LEGACY_VALUE,
  SNEAK_LEGACY_XP,
  SNEAK_SPEED_MULTIPLIER,
  SNEAK_XP_DISTANCE_M,
  survivalDurationMultiplier,
  survivalFoodMultiplier,
  toggleSneak,
  xpToSkillValue,
} from './PlayerSkills'

describe('createPlayerSkills', () => {
  it('starts both skills at the novice floor, inactive, with no xp', () => {
    const skills = createPlayerSkills()
    for (const state of [skills.sneak, skills.survival]) {
      expect(state.xp).toBe(0)
      expect(state.value).toBe(SKILL_MIN_VALUE)
      expect(state.active).toBe(false)
    }
  })
})

describe('xpToSkillValue', () => {
  it('is monotonic and stays inside [SKILL_MIN_VALUE, 1]', () => {
    let previous = xpToSkillValue(0)
    expect(previous).toBe(SKILL_MIN_VALUE)
    for (const xp of [1, 10, 60, 120, 500, 5000, 1e9]) {
      const value = xpToSkillValue(xp)
      expect(value).toBeGreaterThan(previous)
      expect(value).toBeLessThan(1)
      previous = value
    }
  })

  it('has diminishing returns — the first xp is worth more than the last', () => {
    const early = xpToSkillValue(20) - xpToSkillValue(0)
    const late = xpToSkillValue(520) - xpToSkillValue(500)
    expect(early).toBeGreaterThan(late)
  })

  it('clamps malformed input to the floor', () => {
    expect(xpToSkillValue(Number.NaN)).toBe(SKILL_MIN_VALUE)
    expect(xpToSkillValue(-100)).toBe(SKILL_MIN_VALUE)
  })

  it('maps the legacy Sneak xp back to the plan 124 fixed 0.5', () => {
    expect(xpToSkillValue(SNEAK_LEGACY_XP)).toBeCloseTo(SNEAK_LEGACY_VALUE, 10)
  })
})

describe('awardSkillXp', () => {
  it('accumulates xp and re-derives value', () => {
    const skills = createPlayerSkills()
    awardSkillXp(skills, 'survival', SKILL_XP_AWARD.igniteFire)
    expect(skills.survival.xp).toBe(SKILL_XP_AWARD.igniteFire)
    expect(skills.survival.value).toBe(xpToSkillValue(SKILL_XP_AWARD.igniteFire))
    expect(skills.sneak.xp).toBe(0)
  })

  it('ignores zero, negative and malformed awards', () => {
    const skills = createPlayerSkills()
    awardSkillXp(skills, 'survival', 0)
    awardSkillXp(skills, 'survival', -50)
    awardSkillXp(skills, 'survival', Number.NaN)
    expect(skills.survival.xp).toBe(0)
    expect(skills.survival.value).toBe(SKILL_MIN_VALUE)
  })
})

describe('restorePersistedSkills', () => {
  it('overlays persisted xp and derives value', () => {
    const skills = createPlayerSkills()
    restorePersistedSkills(skills, { sneak: { xp: SNEAK_LEGACY_XP }, survival: { xp: 0 } })
    expect(skills.sneak.value).toBeCloseTo(SNEAK_LEGACY_VALUE, 10)
    expect(skills.survival.value).toBe(SKILL_MIN_VALUE)
  })

  it('clamps malformed/missing persisted xp instead of letting NaN through', () => {
    const skills = createPlayerSkills()
    restorePersistedSkills(skills, { sneak: { xp: Number.NaN }, survival: { xp: -10 } })
    expect(skills.sneak.xp).toBe(0)
    expect(skills.sneak.value).toBe(SKILL_MIN_VALUE)
    expect(skills.survival.xp).toBe(0)
    expect(skills.survival.value).toBe(SKILL_MIN_VALUE)
  })

  it('never restores the runtime active flag', () => {
    const skills = createPlayerSkills()
    skills.sneak.active = true
    restorePersistedSkills(skills, { sneak: { xp: 10 }, survival: { xp: 10 } })
    expect(skills.sneak.active).toBe(false)
  })
})

describe('accumulateSneakUse', () => {
  it('awards nothing before a full interval is travelled', () => {
    const skills = createPlayerSkills()
    const left = accumulateSneakUse(skills, 0, SNEAK_XP_DISTANCE_M - 0.5)
    expect(skills.sneak.xp).toBe(0)
    expect(left).toBeCloseTo(SNEAK_XP_DISTANCE_M - 0.5)
  })

  it('awards once per completed interval and keeps the remainder', () => {
    const skills = createPlayerSkills()
    const left = accumulateSneakUse(skills, 0, SNEAK_XP_DISTANCE_M * 2 + 1)
    expect(skills.sneak.xp).toBe(SKILL_XP_AWARD.sneakDistance * 2)
    expect(left).toBeCloseTo(1)
  })

  it('ignores a frame with no movement', () => {
    const skills = createPlayerSkills()
    expect(accumulateSneakUse(skills, 4, 0)).toBe(4)
    expect(skills.sneak.xp).toBe(0)
  })
})

describe('toggleSneak', () => {
  it('flips active on and off without touching progression', () => {
    const skills = createPlayerSkills()
    toggleSneak(skills)
    expect(skills.sneak.active).toBe(true)
    expect(skills.sneak.xp).toBe(0)
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

describe('survivalDurationMultiplier', () => {
  it('is 1 at zero skill and monotonically shortens with skill', () => {
    expect(survivalDurationMultiplier(0)).toBe(1)
    let previous = 1
    for (const value of [0.2, 0.5, 0.8, 1]) {
      const multiplier = survivalDurationMultiplier(value)
      expect(multiplier).toBeLessThan(previous)
      previous = multiplier
    }
  })

  it('never makes an action instant, and clamps out-of-range input', () => {
    expect(survivalDurationMultiplier(1)).toBeGreaterThanOrEqual(0.5)
    expect(survivalDurationMultiplier(99)).toBe(survivalDurationMultiplier(1))
    expect(survivalDurationMultiplier(-99)).toBe(1)
  })
})

describe('survivalFoodMultiplier', () => {
  it('never reduces food value and grows with skill', () => {
    expect(survivalFoodMultiplier(0)).toBe(1)
    expect(survivalFoodMultiplier(0.5)).toBeGreaterThan(1)
    expect(survivalFoodMultiplier(1)).toBeGreaterThan(survivalFoodMultiplier(0.5))
    expect(survivalFoodMultiplier(1)).toBeLessThanOrEqual(2)
  })
})
