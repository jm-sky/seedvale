import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import {
  addHorseTrainingProgress,
  clampHorseTrainingProgress,
  HORSE_TRAINED_PROGRESS,
  HORSE_WARHORSE_PROGRESS,
  horseTrainingModifiers,
  horseTrainingPrice,
  horseTrainingTier,
  normalizeHorseTrainingState,
  rollInitialHorseTrainingProgress,
} from './horseTraining'

describe('horse training (plan settlements-013)', () => {
  it('clamps progress into 0..1 and treats invalid numbers as 0', () => {
    expect(clampHorseTrainingProgress(-2)).toBe(0)
    expect(clampHorseTrainingProgress(0.4)).toBe(0.4)
    expect(clampHorseTrainingProgress(4)).toBe(1)
    expect(clampHorseTrainingProgress(Number.NaN)).toBe(0)
  })

  it('derives ordinary / trained / warhorse from progress only', () => {
    expect(horseTrainingTier(0)).toBe('ordinary')
    expect(horseTrainingTier(HORSE_TRAINED_PROGRESS - 0.01)).toBe('ordinary')
    expect(horseTrainingTier(HORSE_TRAINED_PROGRESS)).toBe('trained')
    expect(horseTrainingTier(HORSE_WARHORSE_PROGRESS - 0.01)).toBe('trained')
    expect(horseTrainingTier(HORSE_WARHORSE_PROGRESS)).toBe('warhorse')
    expect(horseTrainingTier(1)).toBe('warhorse')
  })

  it('keeps ordinary modifiers at the exact species baseline', () => {
    expect(horseTrainingModifiers(0)).toEqual({
      speed: 1,
      staminaDrain: 1,
      staminaCapacity: 1,
      fallRisk: 1,
      maxHp: 1,
      fear: 1,
    })
  })

  it('improves control/stamina/scare for trained and survivability for warhorse without a large speed jump', () => {
    const ordinary = horseTrainingModifiers(0)
    const trained = horseTrainingModifiers(0.5)
    const warhorse = horseTrainingModifiers(1)
    expect(trained.staminaDrain).toBeLessThan(ordinary.staminaDrain)
    expect(trained.fallRisk).toBeLessThan(ordinary.fallRisk)
    expect(trained.fear).toBeLessThan(ordinary.fear)
    expect(warhorse.maxHp).toBeGreaterThan(trained.maxHp)
    expect(warhorse.staminaCapacity).toBeGreaterThan(trained.staminaCapacity)
    expect(warhorse.fear).toBeLessThan(trained.fear)
    expect(warhorse.speed).toBeLessThan(1.08)
    expect(warhorse.speed).toBeGreaterThan(ordinary.speed)
  })

  it('does not mutate global AnimalDef', () => {
    const before = { ...ANIMAL_DEFS.horse.mount }
    horseTrainingModifiers(1)
    addHorseTrainingProgress({ progress: 0.2 }, 0.4)
    expect(ANIMAL_DEFS.horse.mount).toEqual(before)
  })

  it('mutates only through addHorseTrainingProgress', () => {
    const next = addHorseTrainingProgress({ progress: 0.2 }, 0.3)
    expect(next.progress).toBeCloseTo(0.5)
    expect(addHorseTrainingProgress(undefined, 0.1).progress).toBeCloseTo(0.1)
    expect(addHorseTrainingProgress({ progress: 0.95 }, 1).progress).toBe(1)
  })

  it('prices ordinary < trained < warhorse', () => {
    const ordinary = horseTrainingPrice(0.1)
    const trained = horseTrainingPrice(0.5)
    const warhorse = horseTrainingPrice(0.95)
    expect(ordinary).toBeLessThan(trained)
    expect(trained).toBeLessThan(warhorse)
  })

  it('normalizes optional save payloads without requiring the field', () => {
    expect(normalizeHorseTrainingState(undefined)).toBeUndefined()
    expect(normalizeHorseTrainingState(null)).toBeUndefined()
    expect(normalizeHorseTrainingState({ progress: 1.4 })?.progress).toBe(1)
    expect(normalizeHorseTrainingState({ progress: Number.NaN })?.progress).toBe(0)
  })

  it('rolls size-shifted initial progress without emitting a persisted tier', () => {
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5]
    let i = 0
    const random = () => seq[i++ % seq.length]!
    const md = rollInitialHorseTrainingProgress(random, 'MD')
    const xl = rollInitialHorseTrainingProgress(() => 0.95, 'XL')
    expect(md).toBeGreaterThanOrEqual(0)
    expect(md).toBeLessThan(HORSE_TRAINED_PROGRESS)
    expect(horseTrainingTier(xl)).toBe('warhorse')
  })
})
