import type { PhysicalProfile } from '../settlement/npcPhysicalProfile'
import type { PhysicalAttributes } from './PhysicalAttributes'
import {
  resolveHumanAgilityProfile,
  resolveHumanEnduranceProfile,
  resolveHumanStrengthProfile,
} from '../settlement/npcPhysicalProfile'
import { applyInjuryModifiersToAttributes } from './injurySeverity'
import {
  applyConditionModifiersToAttributes,
  type TemporaryConditionsState,
} from './temporaryConditions'

/**
 * @domain shared
 * @system physical-attributes
 * @role Effective SPEA seam (plan npc-024 / npc-025) — profile/base
 *  attributes, then physical-injury modifiers, then temporary-condition
 *  modifiers. Consumers read from here instead of branching on injury or
 *  condition kind.
 */

export type InjuryModifierInput = {
  maxHp: number
  physicalInjury: number
} | null | undefined

export function resolveNpcBasePhysicalAttributes(profile: PhysicalProfile): PhysicalAttributes {
  return {
    agility: resolveHumanAgilityProfile(profile),
    endurance: resolveHumanEnduranceProfile(profile),
    perception: profile.attributes.perception,
    strength: resolveHumanStrengthProfile(profile),
  }
}

export function resolveEffectivePhysicalAttributes(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
  injury?: InjuryModifierInput,
): PhysicalAttributes {
  const withInjury = injury
    ? applyInjuryModifiersToAttributes(base, injury.physicalInjury, injury.maxHp)
    : base
  return applyConditionModifiersToAttributes(withInjury, conditions, nowDays)
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
