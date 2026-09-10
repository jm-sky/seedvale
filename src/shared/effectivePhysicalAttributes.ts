import type { PhysicalProfile } from '../settlement/npcPhysicalProfile'
import {
  resolveHumanAgilityProfile,
  resolveHumanEnduranceProfile,
  resolveHumanStrengthProfile,
} from '../settlement/npcPhysicalProfile'
import { applyInjuryModifiersToAttributes } from './injurySeverity'
import {
  PHYSICAL_ATTRIBUTE_IDS,
  type PhysicalAttributeDelta,
  type PhysicalAttributes,
} from './PhysicalAttributes'
import {
  resolveTemporaryConditionContributions,
  type TemporaryConditionsState,
} from './temporaryConditions'

/**
 * @domain shared
 * @system physical-attributes
 * @role Effective SPEA seam (plan npc-024 / npc-025 / ui-input-013) —
 *  profile/base attributes, then physical-injury modifiers, then
 *  temporary-condition modifiers. Gameplay and Character presentation share
 *  this path; Vue does not recompute effective values.
 */

export type InjuryModifierInput = {
  maxHp: number
  physicalInjury: number
} | null | undefined

/** Domain classification of a modifier contribution. Labels are presentation. */
export type ModifierCategory = 'effect' | 'fatigue' | 'illness' | 'injury'

/**
 * Applied (post-clamp) SPEA delta from one authoritative source. `delta`
 * is the actual change to the running attributes, not the nominal penalty.
 */
export type AttributeModifierContribution = {
  category: ModifierCategory
  sourceId: string
  delta: PhysicalAttributeDelta
}

export type EffectivePhysicalAttributesResult = {
  effective: PhysicalAttributes
  contributions: readonly AttributeModifierContribution[]
}

const CONDITION_MODIFIER_CATEGORY: Record<string, ModifierCategory> = {
  poisoning: 'illness',
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function applyNominalDelta(
  base: PhysicalAttributes,
  delta: PhysicalAttributeDelta,
): PhysicalAttributes {
  return {
    agility: delta.agility !== undefined ? clamp01(base.agility + delta.agility) : base.agility,
    endurance: delta.endurance !== undefined ? clamp01(base.endurance + delta.endurance) : base.endurance,
    perception: delta.perception !== undefined ? clamp01(base.perception + delta.perception) : base.perception,
    strength: delta.strength !== undefined ? clamp01(base.strength + delta.strength) : base.strength,
  }
}

function appliedDelta(
  prior: PhysicalAttributes,
  next: PhysicalAttributes,
): PhysicalAttributeDelta | null {
  const delta: PhysicalAttributeDelta = {}
  let any = false
  for (const id of PHYSICAL_ATTRIBUTE_IDS) {
    const change = next[id] - prior[id]
    if (change === 0) continue
    delta[id] = change
    any = true
  }
  return any ? delta : null
}

function pushContribution(
  contributions: AttributeModifierContribution[] | null,
  category: ModifierCategory,
  sourceId: string,
  prior: PhysicalAttributes,
  next: PhysicalAttributes,
): void {
  if (!contributions) return
  const delta = appliedDelta(prior, next)
  if (!delta) return
  contributions.push({ category, sourceId, delta })
}

function resolveEffective(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
  injury: InjuryModifierInput,
  contributions: AttributeModifierContribution[] | null,
): PhysicalAttributes {
  const afterInjury = injury
    ? applyInjuryModifiersToAttributes(base, injury.physicalInjury, injury.maxHp)
    : base
  pushContribution(contributions, 'injury', 'physical-injury', base, afterInjury)

  let current = afterInjury
  for (const contribution of resolveTemporaryConditionContributions(conditions, nowDays)) {
    const next = applyNominalDelta(current, contribution.delta)
    pushContribution(
      contributions,
      CONDITION_MODIFIER_CATEGORY[contribution.sourceId] ?? 'effect',
      contribution.sourceId,
      current,
      next,
    )
    current = next
  }
  return current
}

export function resolveNpcBasePhysicalAttributes(profile: PhysicalProfile): PhysicalAttributes {
  return {
    agility: resolveHumanAgilityProfile(profile),
    endurance: resolveHumanEnduranceProfile(profile),
    perception: profile.attributes.perception,
    strength: resolveHumanStrengthProfile(profile),
  }
}

/** Gameplay path — identical `effective` to the detailed resolver, without allocating contributions. */
export function resolveEffectivePhysicalAttributes(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
  injury?: InjuryModifierInput,
): PhysicalAttributes {
  return resolveEffective(base, conditions, nowDays, injury, null)
}

/**
 * Same calculation as `resolveEffectivePhysicalAttributes`, plus the applied
 * per-source deltas Character presentation aggregates into badges.
 */
export function resolveEffectivePhysicalAttributesDetailed(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
  injury?: InjuryModifierInput,
): EffectivePhysicalAttributesResult {
  const contributions: AttributeModifierContribution[] = []
  const effective = resolveEffective(base, conditions, nowDays, injury, contributions)
  return { effective, contributions }
}

export function resolveNpcEffectivePhysicalAttributes(
  profile: PhysicalProfile,
  conditions: TemporaryConditionsState,
  nowDays: number,
  injury?: InjuryModifierInput,
): PhysicalAttributes {
  return resolveEffectivePhysicalAttributes(
    resolveNpcBasePhysicalAttributes(profile),
    conditions,
    nowDays,
    injury,
  )
}

export function resolvePlayerEffectivePhysicalAttributes(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
): PhysicalAttributes {
  return resolveEffectivePhysicalAttributes(base, conditions, nowDays)
}

export function resolvePlayerEffectivePhysicalAttributesDetailed(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
): EffectivePhysicalAttributesResult {
  return resolveEffectivePhysicalAttributesDetailed(base, conditions, nowDays)
}
