import {
  criticalInjuryFloor,
  decreaseInjuryFromHeal,
  injurySeverityRank,
  resolveInjurySeverity,
  seriousInjuryFloor,
  type TreatableInjurySeverity,
} from './injurySeverity'

/**
 * @domain shared
 * @system health
 * @role Pure physical-injury treatment resolver (plan items-player-045).
 *  Computes stabilize/material treatment outcomes from injury + potency
 *  metadata without mutating health, consuming items, awarding XP, or
 *  reading PlayerSkills / inventory / UI.
 * @invariants Deterministic; floors are clamps not teleports; material
 *  mode rejects insufficient maxSeverity; over-heal never yields negative
 *  injury in projected results.
 */

export type PhysicalInjuryTreatmentMode = 'material' | 'stabilize'

/** Catalog-shaped treatment metadata — callers copy from ITEM_CATALOG. */
export type PhysicalInjuryTreatmentMaterial = {
  immediateHp: number
  maxSeverity: TreatableInjurySeverity
}

export type ResolvePhysicalInjuryTreatmentInput = {
  maxHp: number
  mode: PhysicalInjuryTreatmentMode
  /** Material metadata required when `mode === 'material'`. */
  material?: PhysicalInjuryTreatmentMaterial
  physicalInjury: number
  /**
   * Requested HP restore potency. For material mode, when omitted the
   * material's `immediateHp` is used. Stabilize mode requires an explicit
   * positive potency from the consumer.
   */
  requestedHp?: number
}

export type PhysicalInjuryTreatmentReason =
  | 'insufficient-severity'
  | 'missing-material'
  | 'no-injury'
  | 'no-potency'

export type PhysicalInjuryTreatmentResult = {
  allowed: boolean
  reason?: PhysicalInjuryTreatmentReason
  /** Projected injury after applying `requestedHpRestore` (never negative). */
  projectedInjury: number
  /** Floor injury cannot go below for this treatment mode/severity. */
  resultingInjuryFloor: number
  requiresMaterial: boolean
  requestedHpRestore: number
}

function stabilizeFloor(physicalInjury: number, maxHp: number): number {
  const severity = resolveInjurySeverity(physicalInjury, maxHp)
  switch (severity) {
    case 'critical':
      return criticalInjuryFloor(maxHp)
    case 'minor':
    case 'none':
      return 0
    case 'serious':
      return seriousInjuryFloor(maxHp)
  }
}

/**
 * Resolves whether a physical-injury treatment may proceed and how much HP
 * restore to request. Does not mutate state.
 */
export function resolvePhysicalInjuryTreatment(
  input: ResolvePhysicalInjuryTreatmentInput,
): PhysicalInjuryTreatmentResult {
  const { maxHp, mode, material, physicalInjury } = input
  const requiresMaterial = mode === 'material'
  const injury = Math.max(0, physicalInjury)

  if (injury <= 0 || maxHp <= 0) {
    return {
      allowed: false,
      reason: 'no-injury',
      projectedInjury: 0,
      resultingInjuryFloor: 0,
      requiresMaterial,
      requestedHpRestore: 0,
    }
  }

  if (mode === 'material') {
    if (!material) {
      return {
        allowed: false,
        reason: 'missing-material',
        projectedInjury: injury,
        resultingInjuryFloor: 0,
        requiresMaterial: true,
        requestedHpRestore: 0,
      }
    }
    const severity = resolveInjurySeverity(injury, maxHp)
    if (
      severity !== 'none'
      && injurySeverityRank(severity) > injurySeverityRank(material.maxSeverity)
    ) {
      return {
        allowed: false,
        reason: 'insufficient-severity',
        projectedInjury: injury,
        resultingInjuryFloor: 0,
        requiresMaterial: true,
        requestedHpRestore: 0,
      }
    }
    const potency = input.requestedHp ?? material.immediateHp
    if (!(potency > 0)) {
      return {
        allowed: false,
        reason: 'no-potency',
        projectedInjury: injury,
        resultingInjuryFloor: 0,
        requiresMaterial: true,
        requestedHpRestore: 0,
      }
    }
    const requestedHpRestore = Math.min(injury, Math.floor(potency))
    const projectedInjury = decreaseInjuryFromHeal(injury, requestedHpRestore)
    return {
      allowed: requestedHpRestore > 0,
      reason: requestedHpRestore > 0 ? undefined : 'no-potency',
      projectedInjury,
      resultingInjuryFloor: 0,
      requiresMaterial: true,
      requestedHpRestore,
    }
  }

  // stabilize
  const floor = stabilizeFloor(injury, maxHp)
  const potency = input.requestedHp ?? 0
  if (!(potency > 0)) {
    return {
      allowed: false,
      reason: 'no-potency',
      projectedInjury: injury,
      resultingInjuryFloor: floor,
      requiresMaterial: false,
      requestedHpRestore: 0,
    }
  }
  const roomAboveFloor = Math.max(0, injury - floor)
  const requestedHpRestore = Math.min(roomAboveFloor, Math.floor(potency))
  const projectedInjury = Math.max(floor, decreaseInjuryFromHeal(injury, requestedHpRestore))
  return {
    allowed: requestedHpRestore > 0,
    reason: requestedHpRestore > 0 ? undefined : (roomAboveFloor <= 0 ? 'no-injury' : 'no-potency'),
    projectedInjury,
    resultingInjuryFloor: floor,
    requiresMaterial: false,
    requestedHpRestore,
  }
}
