import type { PhysicalProfile } from '../settlement/npcPhysicalProfile'
import {
  resolveHumanAgilityProfile,
  resolveHumanEnduranceProfile,
  resolveHumanStrengthProfile,
} from '../settlement/npcPhysicalProfile'
import type { PhysicalAttributes } from './PhysicalAttributes'
import {
  applyConditionModifiersToAttributes,
  type TemporaryConditionsState,
} from './temporaryConditions'

/**
 * @domain shared
 * @system physical-attributes
 * @role Effective SPEA seam (plan npc-024) — profile/base attributes plus
 *  temporary-condition modifiers. Consumers read from here instead of
 *  branching on condition kind.
 */

export function resolveNpcBasePhysicalAttributes(profile: PhysicalProfile): PhysicalAttributes {
  return {
    strength: resolveHumanStrengthProfile(profile),
    perception: profile.attributes.perception,
    endurance: resolveHumanEnduranceProfile(profile),
    agility: resolveHumanAgilityProfile(profile),
  }
}

export function resolveEffectivePhysicalAttributes(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
): PhysicalAttributes {
  return applyConditionModifiersToAttributes(base, conditions, nowDays)
}

export function resolveNpcEffectivePhysicalAttributes(
  profile: PhysicalProfile,
  conditions: TemporaryConditionsState,
  nowDays: number,
): PhysicalAttributes {
  return resolveEffectivePhysicalAttributes(resolveNpcBasePhysicalAttributes(profile), conditions, nowDays)
}

export function resolvePlayerEffectivePhysicalAttributes(
  base: PhysicalAttributes,
  conditions: TemporaryConditionsState,
  nowDays: number,
): PhysicalAttributes {
  return resolveEffectivePhysicalAttributes(base, conditions, nowDays)
}
