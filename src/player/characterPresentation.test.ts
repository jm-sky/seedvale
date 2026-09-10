import { describe, expect, it } from 'vitest'
import type { AttributeModifierContribution } from '../shared/effectivePhysicalAttributes'
import { resolveEffectivePhysicalAttributesDetailed } from '../shared/effectivePhysicalAttributes'
import {
  applyPoisoningExposure,
  createEmptyTemporaryConditions,
} from '../shared/temporaryConditions'
import {
  aggregateAttributeModifierBadges,
  buildCharacterPresentation,
  toDisplayAttribute,
} from './characterPresentation'
import { PLAYER_STARTING_ATTRIBUTES } from './PlayerController'
import { createPlayerSkills } from './PlayerSkills'

describe('aggregateAttributeModifierBadges (plan ui-input-013)', () => {
  it('collapses same-category contributions into one badge', () => {
    const contributions: AttributeModifierContribution[] = [
      { category: 'illness', sourceId: 'poisoning', delta: { strength: -0.03 } },
      { category: 'illness', sourceId: 'other-illness', delta: { strength: -0.02 } },
    ]
    expect(aggregateAttributeModifierBadges(contributions, 'strength')).toEqual([
      { category: 'illness', delta: -5 },
    ])
  })

  it('keeps different categories as separate badges', () => {
    const contributions: AttributeModifierContribution[] = [
      { category: 'illness', sourceId: 'poisoning', delta: { strength: -0.03 } },
      { category: 'injury', sourceId: 'physical-injury', delta: { strength: -0.04 } },
    ]
    expect(aggregateAttributeModifierBadges(contributions, 'strength')).toEqual([
      { category: 'illness', delta: -3 },
      { category: 'injury', delta: -4 },
    ])
  })

  it('omits zero and missing deltas', () => {
    const contributions: AttributeModifierContribution[] = [
      { category: 'illness', sourceId: 'poisoning', delta: { endurance: -0.03 } },
      { category: 'injury', sourceId: 'physical-injury', delta: { strength: 0 } },
    ]
    expect(aggregateAttributeModifierBadges(contributions, 'strength')).toEqual([])
    expect(aggregateAttributeModifierBadges(contributions, 'perception')).toEqual([])
  })
})

describe('buildCharacterPresentation (plan ui-input-013)', () => {
  it('projects all eight skills on the Character display scale', () => {
    const skills = createPlayerSkills()
    const conditions = createEmptyTemporaryConditions()
    const result = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    const view = buildCharacterPresentation({
      base: PLAYER_STARTING_ATTRIBUTES,
      result,
      skills,
      conditions,
    })
    expect(view.skills.map((row) => row.id)).toEqual([
      'sneak', 'survival', 'traps', 'defense', 'archery', 'riding', 'medicine', 'repair',
    ])
    expect(view.skills.every((row) => row.value === toDisplayAttribute(0.2))).toBe(true)
    expect(view.conditions).toEqual([])
    expect(view.attributes.every((row) => row.effective === row.base && row.modifiers.length === 0)).toBe(true)
  })

  it('shows poisoning as an illness with matching SPEA badges', () => {
    const skills = createPlayerSkills()
    const conditions = createEmptyTemporaryConditions()
    applyPoisoningExposure(conditions, 0)
    const result = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    const view = buildCharacterPresentation({
      base: PLAYER_STARTING_ATTRIBUTES,
      result,
      skills,
      conditions,
    })
    const strength = view.attributes.find((row) => row.id === 'strength')
    expect(strength?.effective).toBeLessThan(strength?.base ?? 0)
    expect(strength?.modifiers).toEqual([{ category: 'illness', delta: strength!.effective - strength!.base }])
    expect(view.conditions).toEqual([
      expect.objectContaining({
        sourceId: 'poisoning',
        category: 'illness',
        label: 'Zatrucie',
        severityLabel: 'łagodne',
      }),
    ])
    expect(view.conditions[0]?.effects.some((effect) => effect.id === 'strength' && effect.delta < 0)).toBe(true)
  })
})
