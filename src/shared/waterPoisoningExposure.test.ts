import { describe, expect, it } from 'vitest'
import { PLAYER_STARTING_ATTRIBUTES } from '../player/PlayerController'
import { createWaterSource } from '../world/WaterSource'
import { resolveEffectivePhysicalAttributes } from './effectivePhysicalAttributes'
import { applyPoisoningExposure, createEmptyTemporaryConditions } from './temporaryConditions'
import {
  resolveUnsafeWaterPoisoningExposure,
  tryApplyUnsafeWaterPoisoningExposure,
  waterPoisoningExposureEventRoll,
} from './waterPoisoningExposure'

describe('waterPoisoningExposure (plan npc-024)', () => {
  it('uses the same mechanism for lake and contextually unsafe river quality', () => {
    const lake = createWaterSource('lake')
    const unsafeRiver = { kind: 'river' as const, quality: 'unsafe' as const }
    const roll = 0.1
    expect(tryApplyUnsafeWaterPoisoningExposure(createEmptyTemporaryConditions(), {
      source: lake,
      nowDays: 0,
      roll,
    })).toBe(true)
    expect(tryApplyUnsafeWaterPoisoningExposure(createEmptyTemporaryConditions(), {
      source: unsafeRiver,
      nowDays: 0,
      roll,
    })).toBe(true)
  })

  it('does not expose on safe water or failed rolls', () => {
    const state = createEmptyTemporaryConditions()
    expect(tryApplyUnsafeWaterPoisoningExposure(state, {
      source: createWaterSource('river'),
      nowDays: 0,
      roll: 0.1,
    })).toBe(false)
    expect(tryApplyUnsafeWaterPoisoningExposure(state, {
      source: createWaterSource('lake'),
      nowDays: 0,
      roll: 0.99,
    })).toBe(false)
    expect(state.conditions.poisoning).toBeUndefined()
  })

  it('keeps separate drink events as deterministic roll boundaries', () => {
    const a = waterPoisoningExposureEventRoll({
      worldSeed: 42,
      actorId: 'player',
      drinkEventIndex: 0,
      source: createWaterSource('lake'),
    })
    const b = waterPoisoningExposureEventRoll({
      worldSeed: 42,
      actorId: 'player',
      drinkEventIndex: 1,
      source: createWaterSource('lake'),
    })
    expect(a).not.toBe(b)
    expect(waterPoisoningExposureEventRoll({
      worldSeed: 42,
      actorId: 'player',
      drinkEventIndex: 0,
      source: createWaterSource('lake'),
    })).toBe(a)
  })

  it('respects supplied exposure chance without hard-coding source kinds', () => {
    expect(resolveUnsafeWaterPoisoningExposure({ roll: 0.2, exposureChance: 0.25 })).toBe(true)
    expect(resolveUnsafeWaterPoisoningExposure({ roll: 0.3, exposureChance: 0.25 })).toBe(false)
  })
})

describe('effectivePhysicalAttributes (plan npc-024)', () => {
  it('restores pre-condition effective values after recovery', () => {
    const conditions = createEmptyTemporaryConditions()
    applyPoisoningExposure(conditions, 0)
    const poisoned = resolveEffectivePhysicalAttributes(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    expect(poisoned.strength).toBeLessThan(PLAYER_STARTING_ATTRIBUTES.strength)
    const recovered = resolveEffectivePhysicalAttributes(PLAYER_STARTING_ATTRIBUTES, conditions, 100)
    expect(recovered).toEqual(PLAYER_STARTING_ATTRIBUTES)
  })
})
