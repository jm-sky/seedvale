import type {
  AttributeModifierContribution,
  EffectivePhysicalAttributesResult,
  ModifierCategory,
} from '../shared/effectivePhysicalAttributes'
import {
  PHYSICAL_ATTRIBUTE_IDS,
  type PhysicalAttributeDelta,
  type PhysicalAttributeId,
  type PhysicalAttributes,
} from '../shared/PhysicalAttributes'
import {
  poisoningSeverityTier,
  type TemporaryConditionsState,
} from '../shared/temporaryConditions'
import { type PlayerSkills, SKILL_IDS, type SkillId } from './PlayerSkills'

/**
 * @domain items-player
 * @system player-ui
 * @role Character Screen presentation snapshot (plan ui-input-013). Vue
 *  renders these views; it does not own modifier formulas or effective SPEA.
 *  Not persisted — rebuilt from authoritative player/condition/skill state.
 */

export const ATTRIBUTE_DISPLAY_SCALE = 100

const MODIFIER_CATEGORY_ORDER: readonly ModifierCategory[] = [
  'illness',
  'injury',
  'fatigue',
  'effect',
]

const POISONING_LABEL = 'Zatrucie'
const POISONING_SEVERITY_LABEL = {
  mild: 'łagodne',
  moderate: 'umiarkowane',
  severe: 'ciężkie',
} as const

export type CharacterModifierBadge = {
  category: ModifierCategory
  delta: number
}

export type CharacterAttributeView = {
  id: PhysicalAttributeId
  base: number
  effective: number
  modifiers: readonly CharacterModifierBadge[]
}

export type CharacterSkillView = {
  id: SkillId
  value: number
  xp: number
}

export type CharacterConditionEffectView = {
  id: PhysicalAttributeId
  delta: number
}

export type CharacterConditionView = {
  sourceId: string
  category: ModifierCategory
  label: string
  severityLabel?: string
  effects: readonly CharacterConditionEffectView[]
}

export type CharacterPresentation = {
  attributes: readonly CharacterAttributeView[]
  skills: readonly CharacterSkillView[]
  conditions: readonly CharacterConditionView[]
}

export function toDisplayAttribute(value: number): number {
  return Math.round(value * ATTRIBUTE_DISPLAY_SCALE)
}

export function toDisplaySkill(value: number): number {
  return Math.round(value * ATTRIBUTE_DISPLAY_SCALE)
}

/**
 * Collapses same-category contributions per attribute into one badge.
 * `delta` is display-scale (same units as `effective / base`).
 */
export function aggregateAttributeModifierBadges(
  contributions: readonly AttributeModifierContribution[],
  attributeId: PhysicalAttributeId,
): CharacterModifierBadge[] {
  const sums = new Map<ModifierCategory, number>()
  for (const contribution of contributions) {
    const change = contribution.delta[attributeId]
    if (change === undefined || change === 0) continue
    sums.set(contribution.category, (sums.get(contribution.category) ?? 0) + change)
  }
  const badges: CharacterModifierBadge[] = []
  for (const category of MODIFIER_CATEGORY_ORDER) {
    const sum = sums.get(category)
    if (sum === undefined) continue
    const delta = Math.round(sum * ATTRIBUTE_DISPLAY_SCALE)
    if (delta === 0) continue
    badges.push({ category, delta })
  }
  return badges
}

export function buildCharacterAttributeViews(
  base: PhysicalAttributes,
  result: EffectivePhysicalAttributesResult,
): CharacterAttributeView[] {
  return PHYSICAL_ATTRIBUTE_IDS.map((id) => ({
    id,
    base: toDisplayAttribute(base[id]),
    effective: toDisplayAttribute(result.effective[id]),
    modifiers: aggregateAttributeModifierBadges(result.contributions, id),
  }))
}

export function buildCharacterSkillViews(skills: PlayerSkills): CharacterSkillView[] {
  return SKILL_IDS.map((id) => ({
    id,
    value: toDisplaySkill(skills[id].value),
    xp: skills[id].xp,
  }))
}

export function buildCharacterConditionViews(
  contributions: readonly AttributeModifierContribution[],
  conditions: TemporaryConditionsState,
): CharacterConditionView[] {
  const bySource = new Map<string, { category: ModifierCategory, deltas: PhysicalAttributeDelta }>()
  for (const contribution of contributions) {
    const existing = bySource.get(contribution.sourceId)
    if (!existing) {
      bySource.set(contribution.sourceId, {
        category: contribution.category,
        deltas: { ...contribution.delta },
      })
      continue
    }
    for (const id of PHYSICAL_ATTRIBUTE_IDS) {
      const change = contribution.delta[id]
      if (change === undefined || change === 0) continue
      existing.deltas[id] = (existing.deltas[id] ?? 0) + change
    }
  }

  const views: CharacterConditionView[] = []
  for (const [sourceId, grouped] of bySource) {
    const effects: CharacterConditionEffectView[] = []
    for (const id of PHYSICAL_ATTRIBUTE_IDS) {
      const change = grouped.deltas[id]
      if (change === undefined || change === 0) continue
      const delta = Math.round(change * ATTRIBUTE_DISPLAY_SCALE)
      if (delta === 0) continue
      effects.push({ id, delta })
    }
    if (effects.length === 0) continue
    views.push({
      sourceId,
      category: grouped.category,
      ...describeConditionSource(sourceId, conditions),
      effects,
    })
  }
  return views
}

function describeConditionSource(
  sourceId: string,
  conditions: TemporaryConditionsState,
): { label: string, severityLabel?: string } {
  if (sourceId === 'poisoning') {
    const severity = conditions.conditions.poisoning?.severity ?? 0
    const tier = poisoningSeverityTier(severity)
    return {
      label: POISONING_LABEL,
      severityLabel: tier ? POISONING_SEVERITY_LABEL[tier] : undefined,
    }
  }
  if (sourceId === 'physical-injury') {
    return { label: 'Uraz' }
  }
  return { label: sourceId }
}

/**
 * Presentation-only snapshot for Character Screen. Does not mutate
 * conditions; callers must already have resolved them via the effective
 * SPEA pass that produced `result`.
 */
export function buildCharacterPresentation(input: {
  base: PhysicalAttributes
  result: EffectivePhysicalAttributesResult
  skills: PlayerSkills
  conditions: TemporaryConditionsState
}): CharacterPresentation {
  return {
    attributes: buildCharacterAttributeViews(input.base, input.result),
    skills: buildCharacterSkillViews(input.skills),
    conditions: buildCharacterConditionViews(input.result.contributions, input.conditions),
  }
}
