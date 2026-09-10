import { describe, expect, it } from 'vitest'
import { PLAYER_STARTING_ATTRIBUTES } from '../player/PlayerController'
import {
  resolveEffectivePhysicalAttributes,
  resolveEffectivePhysicalAttributesDetailed,
} from './effectivePhysicalAttributes'
import {
  applyPoisoningExposure,
  createEmptyTemporaryConditions,
  POISONING_MAX_SEVERITY,
  poisoningSpeaPenalties,
} from './temporaryConditions'

describe('resolveEffectivePhysicalAttributesDetailed (plan ui-input-013)', () => {
  it('matches the simple resolver with no contributions when there are no conditions', () => {
    const conditions = createEmptyTemporaryConditions()
    const detailed = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    expect(detailed.effective).toEqual(PLAYER_STARTING_ATTRIBUTES)
    expect(detailed.contributions).toEqual([])
    expect(resolveEffectivePhysicalAttributes(PLAYER_STARTING_ATTRIBUTES, conditions, 0)).toEqual(detailed.effective)
  })

  it('keeps poisoning effective SPEA identical to the gameplay resolver', () => {
    const conditions = createEmptyTemporaryConditions()
    applyPoisoningExposure(conditions, 0)
    const simple = resolveEffectivePhysicalAttributes(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    const detailed = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    expect(detailed.effective).toEqual(simple)
    expect(detailed.effective.strength).toBeLessThan(PLAYER_STARTING_ATTRIBUTES.strength)
    expect(detailed.effective.perception).toBe(PLAYER_STARTING_ATTRIBUTES.perception)

    const poisoning = detailed.contributions.find((c) => c.sourceId === 'poisoning')
    expect(poisoning?.category).toBe('illness')
    expect(poisoning?.delta.strength).toBeCloseTo(simple.strength - PLAYER_STARTING_ATTRIBUTES.strength)
    expect(poisoning?.delta.endurance).toBeCloseTo(simple.endurance - PLAYER_STARTING_ATTRIBUTES.endurance)
    expect(poisoning?.delta.agility).toBeCloseTo(simple.agility - PLAYER_STARTING_ATTRIBUTES.agility)
    expect(poisoning?.delta.perception).toBeUndefined()
  })

  it('records the applied (clamped) delta, not the nominal penalty', () => {
    const base = { strength: 0.02, perception: 0.6, endurance: 0.02, agility: 0.02 }
    const conditions = createEmptyTemporaryConditions()
    conditions.conditions.poisoning = { severity: POISONING_MAX_SEVERITY, lastUpdatedAtDays: 0 }
    const nominal = poisoningSpeaPenalties(POISONING_MAX_SEVERITY)
    expect(nominal.strength).toBeLessThan(-0.02)

    const detailed = resolveEffectivePhysicalAttributesDetailed(base, conditions, 0)
    expect(detailed.effective.strength).toBe(0)
    const poisoning = detailed.contributions.find((c) => c.sourceId === 'poisoning')
    expect(poisoning?.delta.strength).toBeDefined()
    expect(poisoning!.delta.strength).toBeCloseTo(-0.02)
    expect(poisoning!.delta.strength).toBeCloseTo(detailed.effective.strength - base.strength)
    expect(poisoning!.delta.strength).not.toBeCloseTo(nominal.strength)
  })

  it('emits an injury contribution only when injury input is supplied', () => {
    const conditions = createEmptyTemporaryConditions()
    const without = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    expect(without.contributions.some((c) => c.category === 'injury')).toBe(false)

    const withInjury = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0, {
      maxHp: 100,
      physicalInjury: 80,
    })
    const simple = resolveEffectivePhysicalAttributes(PLAYER_STARTING_ATTRIBUTES, conditions, 0, {
      maxHp: 100,
      physicalInjury: 80,
    })
    expect(withInjury.effective).toEqual(simple)
    const injury = withInjury.contributions.find((c) => c.category === 'injury')
    expect(injury?.sourceId).toBe('physical-injury')
    expect(injury?.delta.strength).toBeCloseTo(simple.strength - PLAYER_STARTING_ATTRIBUTES.strength)
  })
})
