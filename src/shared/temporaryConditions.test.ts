import { describe, expect, it } from 'vitest'
import { PLAYER_STARTING_ATTRIBUTES } from '../player/PlayerController'
import {
  applyConditionModifiersToAttributes,
  applyPoisoningExposure,
  applyPoisoningTreatment,
  createEmptyTemporaryConditions,
  getResolvedPoisoningSeverity,
  POISONING_INITIAL_EXPOSURE_SEVERITY,
  POISONING_MAX_SEVERITY,
  POISONING_REPEAT_EXPOSURE_SEVERITY,
  poisoningSpeaPenalties,
  restoreTemporaryConditions,
  snapshotTemporaryConditions,
} from './temporaryConditions'

describe('temporaryConditions (plan npc-024)', () => {
  it('clamps severity to the valid range on exposure and repeat exposure', () => {
    const state = createEmptyTemporaryConditions()
    applyPoisoningExposure(state, 1)
    expect(getResolvedPoisoningSeverity(state, 1)).toBe(POISONING_INITIAL_EXPOSURE_SEVERITY)

    applyPoisoningExposure(state, 1)
    expect(getResolvedPoisoningSeverity(state, 1)).toBe(
      POISONING_INITIAL_EXPOSURE_SEVERITY + POISONING_REPEAT_EXPOSURE_SEVERITY,
    )

    for (let i = 0; i < 20; i++) applyPoisoningExposure(state, 1)
    expect(getResolvedPoisoningSeverity(state, 1)).toBe(POISONING_MAX_SEVERITY)
  })

  it('recovers deterministically with elapsed game time and removes at zero', () => {
    const state = createEmptyTemporaryConditions()
    applyPoisoningExposure(state, 10)
    expect(getResolvedPoisoningSeverity(state, 12)).toBeLessThan(POISONING_INITIAL_EXPOSURE_SEVERITY)
    expect(getResolvedPoisoningSeverity(state, 20)).toBe(0)
    expect(state.conditions.poisoning).toBeUndefined()
  })

  it('never mutates base SPEA — modifiers are derived on read', () => {
    const base = { ...PLAYER_STARTING_ATTRIBUTES }
    const state = createEmptyTemporaryConditions()
    applyPoisoningExposure(state, 0)

    const first = applyConditionModifiersToAttributes(base, state, 0)
    const second = applyConditionModifiersToAttributes(base, state, 0)

    expect(base).toEqual(PLAYER_STARTING_ATTRIBUTES)
    expect(first.strength).toBeLessThan(base.strength)
    expect(second).toEqual(first)
  })

  it('greater severity never produces weaker impairment', () => {
    const low = poisoningSpeaPenalties(20).strength
    const high = poisoningSpeaPenalties(80).strength
    expect(high).toBeLessThan(low)
  })

  it('round-trips authoritative snapshot without effective values', () => {
    const state = createEmptyTemporaryConditions()
    applyPoisoningExposure(state, 3.5)
    const saved = snapshotTemporaryConditions(state)
    const restored = restoreTemporaryConditions(saved)
    expect(getResolvedPoisoningSeverity(restored, 3.5)).toBe(getResolvedPoisoningSeverity(state, 3.5))
  })

  it('treatment reduces severity on the condition itself', () => {
    const state = createEmptyTemporaryConditions()
    applyPoisoningExposure(state, 0)
    applyPoisoningTreatment(state, 0, 10)
    expect(getResolvedPoisoningSeverity(state, 0)).toBe(POISONING_INITIAL_EXPOSURE_SEVERITY - 10)
  })
})
