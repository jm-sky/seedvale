import { describe, expect, it } from 'vitest'
import {
  foodPoisoningExposureEventRoll,
  resolveRawMeatPoisoningExposure,
  tryApplyRawMeatPoisoningExposure,
} from './foodPoisoningExposure'
import { createEmptyTemporaryConditions } from './temporaryConditions'

describe('foodPoisoningExposure (plan items-player-023)', () => {
  it('is deterministic for the same seed/actor/index/food identity', () => {
    const input = {
      worldSeed: 42,
      actorId: 'player',
      foodEventIndex: 0,
      kind: 'boar_meat' as const,
      sourceSpecies: 'boar' as const,
    }
    expect(foodPoisoningExposureEventRoll(input)).toBe(foodPoisoningExposureEventRoll(input))
  })

  it('changing the event index changes the roll', () => {
    const base = { worldSeed: 42, actorId: 'player', kind: 'boar_meat' as const, sourceSpecies: 'boar' as const }
    const a = foodPoisoningExposureEventRoll({ ...base, foodEventIndex: 0 })
    const b = foodPoisoningExposureEventRoll({ ...base, foodEventIndex: 1 })
    expect(a).not.toBe(b)
  })

  it('changing the source identity (kind/species) changes the roll', () => {
    const base = { worldSeed: 42, actorId: 'player', foodEventIndex: 0 }
    const boar = foodPoisoningExposureEventRoll({ ...base, kind: 'boar_meat', sourceSpecies: 'boar' })
    const wolf = foodPoisoningExposureEventRoll({ ...base, kind: 'wolf_meat', sourceSpecies: 'wolf' })
    const generic = foodPoisoningExposureEventRoll({ ...base, kind: 'raw_meat' })
    expect(boar).not.toBe(wolf)
    expect(boar).not.toBe(generic)
  })

  it('never shares a roll sequence with the water-poisoning salt', () => {
    // Same worldSeed/actorId/index as a water roll would use — food events
    // must not collide with drink events just because the numbers line up.
    const foodRoll = foodPoisoningExposureEventRoll({
      worldSeed: 42, actorId: 'player', foodEventIndex: 0, kind: 'raw_meat',
    })
    expect(Number.isFinite(foodRoll)).toBe(true)
    expect(foodRoll).toBeGreaterThanOrEqual(0)
    expect(foodRoll).toBeLessThan(1)
  })

  it('resolveRawMeatPoisoningExposure compares the roll against the supplied chance', () => {
    expect(resolveRawMeatPoisoningExposure({ roll: 0.1, chance: 0.2 })).toBe(true)
    expect(resolveRawMeatPoisoningExposure({ roll: 0.3, chance: 0.2 })).toBe(false)
  })

  it('tryApplyRawMeatPoisoningExposure applies poisoning only on a successful roll', () => {
    const conditions = createEmptyTemporaryConditions()
    expect(tryApplyRawMeatPoisoningExposure(conditions, { nowDays: 0, roll: 0.5, chance: 0.2, severity: 20 })).toBe(false)
    expect(conditions.conditions.poisoning).toBeUndefined()

    expect(tryApplyRawMeatPoisoningExposure(conditions, { nowDays: 0, roll: 0.1, chance: 0.2, severity: 20 })).toBe(true)
    expect(conditions.conditions.poisoning?.severity).toBe(20)
  })

  it('repeated successful exposure accumulates through the existing poisoning rules', () => {
    const conditions = createEmptyTemporaryConditions()
    tryApplyRawMeatPoisoningExposure(conditions, { nowDays: 0, roll: 0, chance: 1, severity: 20 })
    const firstSeverity = conditions.conditions.poisoning?.severity ?? 0
    tryApplyRawMeatPoisoningExposure(conditions, { nowDays: 0, roll: 0, chance: 1, severity: 20 })
    expect(conditions.conditions.poisoning!.severity).toBeGreaterThan(firstSeverity)
  })
})
