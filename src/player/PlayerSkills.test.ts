import { describe, expect, it } from 'vitest'
import {
  accumulateSneakUse,
  applySneakSpeedModifier,
  awardSkillXp,
  createPlayerSkills,
  raiseSkillToValue,
  restorePersistedSkills,
  ridingSpeedMultiplier,
  ridingStaminaDrainMultiplier,
  setSkillValueForDebug,
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

  it('includes archery (plan 162)', () => {
    const skills = createPlayerSkills()
    expect(skills.archery.xp).toBe(0)
    expect(skills.archery.value).toBe(SKILL_MIN_VALUE)
    expect(skills.archery.active).toBe(false)
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

  it('restores a fresh archery skill when the saved payload predates it', () => {
    const skills = createPlayerSkills()
    restorePersistedSkills(skills, { sneak: { xp: 10 }, survival: { xp: 10 } })
    expect(skills.archery.xp).toBe(0)
    expect(skills.archery.value).toBe(SKILL_MIN_VALUE)
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

describe('ridingSpeedMultiplier (plan fauna-008)', () => {
  it('is exactly 1 at minimum Riding — the unmodified rideable-species baseline', () => {
    expect(ridingSpeedMultiplier(SKILL_MIN_VALUE)).toBe(1)
  })

  it('increases monotonically with skill', () => {
    let previous = ridingSpeedMultiplier(SKILL_MIN_VALUE)
    for (const value of [0.4, 0.6, 0.8, 1]) {
      const multiplier = ridingSpeedMultiplier(value)
      expect(multiplier).toBeGreaterThan(previous)
      previous = multiplier
    }
  })

  it('clamps out-of-range input to the same domain as the other skill-effect helpers', () => {
    expect(ridingSpeedMultiplier(-99)).toBe(ridingSpeedMultiplier(SKILL_MIN_VALUE))
    expect(ridingSpeedMultiplier(99)).toBe(ridingSpeedMultiplier(1))
  })
})

describe('raiseSkillToValue (plan items-player-016)', () => {
  it('raises a skill to exactly the target value', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.23)
    const result = raiseSkillToValue(skills, 'riding', 0.40)
    expect(result.changed).toBe(true)
    expect(result.previousValue).toBeCloseTo(0.23, 5)
    expect(result.value).toBeCloseTo(0.40, 5)
    expect(skills.riding.value).toBeCloseTo(0.40, 5)
  })

  it('is a no-op when the current value already meets the target', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.40)
    const xpBefore = skills.riding.xp
    const result = raiseSkillToValue(skills, 'riding', 0.40)
    expect(result.changed).toBe(false)
    expect(skills.riding.xp).toBe(xpBefore)
  })

  it('never lowers xp or value', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.55)
    const xpBefore = skills.riding.xp
    const result = raiseSkillToValue(skills, 'riding', 0.40)
    expect(result.changed).toBe(false)
    expect(skills.riding.xp).toBe(xpBefore)
    expect(skills.riding.value).toBeCloseTo(0.55, 5)
  })

  it('reading the same target twice does not farm additional xp', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.23)
    raiseSkillToValue(skills, 'riding', 0.40)
    const xpAfterFirst = skills.riding.xp
    const second = raiseSkillToValue(skills, 'riding', 0.40)
    expect(second.changed).toBe(false)
    expect(skills.riding.xp).toBe(xpAfterFirst)
  })

  it('leaves other skills untouched', () => {
    const skills = createPlayerSkills()
    raiseSkillToValue(skills, 'riding', 0.6)
    expect(skills.archery.xp).toBe(0)
  })

  it('practice (awardSkillXp) after a book can still exceed the book target', () => {
    const skills = createPlayerSkills()
    raiseSkillToValue(skills, 'riding', 0.80)
    for (let i = 0; i < 50; i++) awardSkillXp(skills, 'riding', 50)
    expect(skills.riding.value).toBeGreaterThan(0.80)
  })
})

describe('setSkillValueForDebug', () => {
  it('sets a skill to the requested value, including lowering it', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.7)
    expect(skills.riding.value).toBeCloseTo(0.7, 5)
    setSkillValueForDebug(skills, 'riding', 0.39)
    expect(skills.riding.value).toBeCloseTo(0.39, 5)
  })

  it('clamps to [SKILL_MIN_VALUE, 1]', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', -5)
    expect(skills.riding.value).toBe(SKILL_MIN_VALUE)
    setSkillValueForDebug(skills, 'riding', 5)
    expect(skills.riding.value).toBeCloseTo(1, 6)
    expect(Number.isFinite(skills.riding.xp)).toBe(true)
  })
})

describe('ridingStaminaDrainMultiplier (plan fauna-008)', () => {
  it('is exactly 1 at minimum Riding — preserves the existing 3/s baseline', () => {
    expect(ridingStaminaDrainMultiplier(SKILL_MIN_VALUE)).toBe(1)
  })

  it('decreases monotonically with skill, never reaching zero', () => {
    let previous = ridingStaminaDrainMultiplier(SKILL_MIN_VALUE)
    for (const value of [0.4, 0.6, 0.8, 1]) {
      const multiplier = ridingStaminaDrainMultiplier(value)
      expect(multiplier).toBeLessThan(previous)
      expect(multiplier).toBeGreaterThan(0)
      previous = multiplier
    }
  })

  it('clamps out-of-range input to the same domain as the other skill-effect helpers', () => {
    expect(ridingStaminaDrainMultiplier(-99)).toBe(ridingStaminaDrainMultiplier(SKILL_MIN_VALUE))
    expect(ridingStaminaDrainMultiplier(99)).toBe(ridingStaminaDrainMultiplier(1))
  })
})
