import { describe, expect, it } from 'vitest'
import {
  MEDICINE_EFFECT_MULTIPLIER_MAX,
  MEDICINE_EFFECT_MULTIPLIER_MIN,
  resolveMedicinalTreatmentMultiplier,
  scaleMedicinalTreatmentAmount,
  SURVIVAL_SUPPORT_MULTIPLIER_MAX,
} from './medicinalTreatmentEffectiveness'
import { createPlayerSkills } from './PlayerSkills'

describe('medicinalTreatmentEffectiveness (plan items-player-043)', () => {
  it('keeps novice Medicine useful and mastery within the planned bounds', () => {
    const novice = createPlayerSkills()
    novice.medicine.value = 0
    novice.survival.value = 0
    expect(resolveMedicinalTreatmentMultiplier(novice)).toBeCloseTo(MEDICINE_EFFECT_MULTIPLIER_MIN)

    const master = createPlayerSkills()
    master.medicine.value = 1
    master.survival.value = 1
    expect(resolveMedicinalTreatmentMultiplier(master)).toBeCloseTo(
      MEDICINE_EFFECT_MULTIPLIER_MAX + SURVIVAL_SUPPORT_MULTIPLIER_MAX,
    )
  })

  it('improves monotonically with Medicine and weights Survival less', () => {
    const low = createPlayerSkills()
    low.medicine.value = 0.2
    low.survival.value = 1
    const high = createPlayerSkills()
    high.medicine.value = 0.8
    high.survival.value = 0
    expect(resolveMedicinalTreatmentMultiplier(high)).toBeGreaterThan(
      resolveMedicinalTreatmentMultiplier(low),
    )
  })

  it('scales catalog potency with a single rounding policy', () => {
    const skills = createPlayerSkills()
    skills.medicine.value = 0
    skills.survival.value = 0
    expect(scaleMedicinalTreatmentAmount(12, skills)).toBe(10)
    expect(scaleMedicinalTreatmentAmount(24, skills)).toBe(20)
  })
})
