import { describe, expect, it } from 'vitest'
import type { AttributeModifierContribution } from '../shared/effectivePhysicalAttributes'
import { createArmorInstance } from '../items/armorItemInstances'
import { createEquipmentState, resolveEquipmentModifiers } from '../items/equipment'
import { Inventory } from '../items/Inventory'
import { resolveEffectivePhysicalAttributesDetailed } from '../shared/effectivePhysicalAttributes'
import {
  applyPoisoningExposure,
  createEmptyTemporaryConditions,
} from '../shared/temporaryConditions'
import {
  aggregateAttributeModifierBadges,
  buildCharacterEquipmentView,
  buildCharacterPresentation,
  equipmentModifiersToCharacterView,
  NEUTRAL_CHARACTER_EQUIPMENT_VIEW,
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

function emptyEquipmentContext(): {
  equipmentModifiers: ReturnType<typeof resolveEquipmentModifiers>
  equipment: ReturnType<typeof createEquipmentState>
  inventory: Inventory
} {
  const inventory = new Inventory({})
  const equipment = createEquipmentState(inventory)
  return {
    inventory,
    equipment,
    equipmentModifiers: resolveEquipmentModifiers(equipment, inventory),
  }
}

describe('buildCharacterPresentation (plan ui-input-013)', () => {
  it('projects all eight skills on the Character display scale', () => {
    const skills = createPlayerSkills()
    const conditions = createEmptyTemporaryConditions()
    const result = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    const { equipment, equipmentModifiers, inventory } = emptyEquipmentContext()
    const view = buildCharacterPresentation({
      base: PLAYER_STARTING_ATTRIBUTES,
      result,
      skills,
      conditions,
      equipmentModifiers,
      equipment,
      inventory,
    })
    expect(view.skills.map((row) => row.id)).toEqual([
      'sneak', 'survival', 'traps', 'defense', 'archery', 'riding', 'medicine', 'repair',
    ])
    expect(view.skills.every((row) => row.value === toDisplayAttribute(0.2))).toBe(true)
    expect(view.conditions).toEqual([])
    expect(view.attributes.every((row) => row.effective === row.base && row.modifiers.length === 0)).toBe(true)
    expect(view.equipment).toEqual(NEUTRAL_CHARACTER_EQUIPMENT_VIEW)
  })

  it('shows poisoning as an illness with matching SPEA badges', () => {
    const skills = createPlayerSkills()
    const conditions = createEmptyTemporaryConditions()
    applyPoisoningExposure(conditions, 0)
    const result = resolveEffectivePhysicalAttributesDetailed(PLAYER_STARTING_ATTRIBUTES, conditions, 0)
    const { equipment, equipmentModifiers, inventory } = emptyEquipmentContext()
    const view = buildCharacterPresentation({
      base: PLAYER_STARTING_ATTRIBUTES,
      result,
      skills,
      conditions,
      equipmentModifiers,
      equipment,
      inventory,
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

describe('character equipment presentation (plan items-player-031)', () => {
  it('maps neutral modifiers to zero deltas', () => {
    expect(equipmentModifiersToCharacterView({
      incomingDamageMultiplier: 1,
      meleeStaminaMultiplier: 1,
      meleeRecoveryMultiplier: 1,
      movementSpeedMultiplier: 1,
      sprintStaminaMultiplier: 1,
    })).toEqual({
      damageReduction: 0,
      attackStaminaDelta: 0,
      meleeRecoveryDelta: 0,
      movementSpeedDelta: 0,
      sprintStaminaDelta: 0,
    })
  })

  it('projects equipped body armor into slot rows and aggregate deltas', () => {
    const inventory = new Inventory({})
    const inst = createArmorInstance('chainmail', 'good')
    expect(inventory.addInstance(inst)).toBe(true)
    const equipment = createEquipmentState(inventory)
    equipment.equip(inst.id, inventory)
    const modifiers = resolveEquipmentModifiers(equipment, inventory)
    const view = buildCharacterEquipmentView(modifiers, equipment, inventory)
    expect(view.damageReduction).toBe(1 - modifiers.incomingDamageMultiplier)
    expect(view.slots.find((row) => row.slot === 'body')).toEqual({
      slot: 'body',
      itemLabel: 'kolczuga',
      qualityLabel: 'Dobra',
    })
    expect(view.slots.filter((row) => row.itemLabel != null)).toHaveLength(1)
  })
})
