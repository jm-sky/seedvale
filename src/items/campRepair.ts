import type { PhysicalEffortIntensity } from '../player/PlayerNeeds'
import type { MaterialRequirement } from './constructionMaterials'
import type { ItemCapability } from './itemCatalog'
import type { ItemKind } from './items'
import {
  checkpointCondition,
  clampCondition,
  CONDITION_MAX,
} from '../world/condition'
import {
  applyRepairWork,
  isRepairComplete,
  type RepairProgress,
} from '../world/repair'
import {
  BEDROLL_MATERIAL_REQUIREMENTS,
  PLATFORM_MATERIAL_REQUIREMENTS,
} from '../world/sleepingUtilities'

/**
 * Camp-domain repair policy for player-built tent / bedroll / platform
 * (plan items-player-019). Shared by preview and authoritative start.
 * Does not own world records, Inventory, Busy Action, or skill XP.
 *
 * @domain items-player
 */

export type CampRepairTargetKind = 'tent' | 'bedroll' | 'platform'

/** Cheaper than rebuilding from the original construction cost, same idea as
 *  `WELL_ROOF_REPAIR_COST_FACTOR`. */
export const CAMP_REPAIR_COST_FACTOR = 0.75

/** Hide patches for a fully ruined tent — tents are purchased, not built
 *  from hide, so this is a repair-only material budget. */
export const TENT_REPAIR_FULL_HIDE = 2
export const TENT_REPAIR_FULL_WORK_HOURS = 0.5
export const BEDROLL_REPAIR_FULL_WORK_HOURS = 0.4
export const PLATFORM_REPAIR_FULL_WORK_HOURS = 1

/** One busy bout credits at most this many work hours (same shape as well
 *  repair, smaller because camp episodes are shorter). */
export const CAMP_REPAIR_SESSION_HOURS = 0.5
export const CAMP_REPAIR_SESSION_SEC = 8

/** Repair XP per accepted work hour — only awarded for useful work. */
export const CAMP_REPAIR_XP_PER_WORK_HOUR = 16

/** Strongest busy-duration cut Repair can give at skill value 1. */
export const CAMP_REPAIR_DURATION_CUT = 0.35

export type CampRepairQuote = {
  kind: CampRepairTargetKind
  currentCondition: number
  targetCondition: number
  materials: readonly MaterialRequirement[]
  requiredWork: number
  capability: ItemCapability
  effort: PhysicalEffortIntensity
}

export type CampRepairStartOutcome =
  | {
    status: 'started'
    quote: CampRepairQuote
    progress: RepairProgress
    condition: number
    lastConditionUpdateAtDays: number
  }
  | { status: 'blocked', missing: readonly MaterialRequirement[] }
  | { status: 'blocked-capability', capability: ItemCapability }
  | { status: 'unavailable' }

type CampRepairPolicy = {
  materialKind: ItemKind
  fullMaterial: number
  fullWorkHours: number
  capability: ItemCapability
  effort: PhysicalEffortIntensity
}

function bedrollFullHide(): number {
  return BEDROLL_MATERIAL_REQUIREMENTS.reduce((sum, r) => r.kind === 'hide' ? sum + r.count : sum, 0)
}

function platformFullBranch(): number {
  return PLATFORM_MATERIAL_REQUIREMENTS.reduce((sum, r) => r.kind === 'branch' ? sum + r.count : sum, 0)
}

function policyFor(kind: CampRepairTargetKind): CampRepairPolicy {
  if (kind === 'tent') {
    return {
      materialKind: 'hide',
      fullMaterial: TENT_REPAIR_FULL_HIDE,
      fullWorkHours: TENT_REPAIR_FULL_WORK_HOURS,
      capability: 'textile_repair',
      effort: 'light',
    }
  }
  if (kind === 'bedroll') {
    return {
      materialKind: 'hide',
      fullMaterial: bedrollFullHide(),
      fullWorkHours: BEDROLL_REPAIR_FULL_WORK_HOURS,
      capability: 'textile_repair',
      effort: 'light',
    }
  }
  return {
    materialKind: 'branch',
    fullMaterial: platformFullBranch(),
    fullWorkHours: PLATFORM_REPAIR_FULL_WORK_HOURS,
    capability: 'wood_chopping',
    effort: 'moderate',
  }
}

function restoredConditionFraction(currentCondition: number, targetCondition: number): number {
  return (targetCondition - currentCondition) / CONDITION_MAX
}

function repairMaterials(policy: CampRepairPolicy, restoredFraction: number): readonly MaterialRequirement[] {
  if (policy.fullMaterial <= 0 || restoredFraction <= 0) return []
  const count = Math.max(1, Math.round(policy.fullMaterial * restoredFraction * CAMP_REPAIR_COST_FACTOR))
  return [{ kind: policy.materialKind, count }]
}

function repairRequiredWork(policy: CampRepairPolicy, restoredFraction: number): number {
  return policy.fullWorkHours * restoredFraction * CAMP_REPAIR_COST_FACTOR
}

/**
 * Pure quote from a resolved current condition. `null` when `targetCondition`
 * is not a legal improvement. Does not know about an already-active episode —
 * callers that need that gate check the record themselves.
 *
 * @domain items-player
 */
export function resolveCampRepairQuote(
  kind: CampRepairTargetKind,
  currentCondition: number,
  targetCondition = CONDITION_MAX,
): CampRepairQuote | null {
  const current = clampCondition(currentCondition)
  if (!(current < targetCondition && targetCondition <= CONDITION_MAX)) return null
  const policy = policyFor(kind)
  const fraction = restoredConditionFraction(current, targetCondition)
  return {
    kind,
    currentCondition: current,
    targetCondition,
    materials: repairMaterials(policy, fraction),
    requiredWork: repairRequiredWork(policy, fraction),
    capability: policy.capability,
    effort: policy.effort,
  }
}

/**
 * Authoritative start-repair transaction. Quote + capability + material
 * preflight run first; condition is checkpointed and the episode is created
 * only after every requirement is available.
 *
 * @domain items-player
 */
export function beginCampRepair(params: {
  kind: CampRepairTargetKind
  currentCondition: number
  nowDays: number
  hasActiveRepair: boolean
  targetCondition?: number
  hasCapability: (capability: ItemCapability) => boolean
  hasMaterial: (requirement: MaterialRequirement) => boolean
  consumeMaterial: (requirement: MaterialRequirement) => void
}): CampRepairStartOutcome {
  if (params.hasActiveRepair) return { status: 'unavailable' }
  const quote = resolveCampRepairQuote(params.kind, params.currentCondition, params.targetCondition)
  if (!quote) return { status: 'unavailable' }
  if (!params.hasCapability(quote.capability)) {
    return { status: 'blocked-capability', capability: quote.capability }
  }
  const missing = quote.materials.filter((requirement) => !params.hasMaterial(requirement))
  if (missing.length > 0) return { status: 'blocked', missing }
  for (const requirement of quote.materials) params.consumeMaterial(requirement)
  const checkpointed = checkpointCondition(quote.currentCondition, params.nowDays)
  return {
    status: 'started',
    quote,
    progress: {
      startedCondition: checkpointed.condition,
      targetCondition: quote.targetCondition,
      requiredWork: quote.requiredWork,
      completedWork: 0,
    },
    condition: checkpointed.condition,
    lastConditionUpdateAtDays: checkpointed.lastConditionUpdateAtDays,
  }
}

export type CampRepairableRecord = {
  condition: number
  lastConditionUpdateAtDays: number
  repair?: RepairProgress
}

/**
 * Apply an actor-neutral work contribution. Completion writes
 * `targetCondition`, clears the episode, and resets the degradation anchor.
 * Does not mutate `record`.
 *
 * @domain items-player
 */
export function applyCampRepairWork<T extends CampRepairableRecord>(
  record: T,
  workAmount: number,
  nowDays: number,
): { record: T, acceptedWork: number } {
  if (!record.repair) return { record, acceptedWork: 0 }
  const { progress, acceptedWork } = applyRepairWork(record.repair, workAmount)
  if (!isRepairComplete(progress)) {
    return { record: { ...record, repair: progress }, acceptedWork }
  }
  const next = {
    ...record,
    condition: progress.targetCondition,
    lastConditionUpdateAtDays: nowDays,
  }
  delete next.repair
  return { record: next, acceptedWork }
}

export function hasActiveCampRepair(record: { repair?: RepairProgress }): boolean {
  return record.repair !== undefined
}

/** Capability the actor must still have to start or resume this target. */
export function campRepairCapability(kind: CampRepairTargetKind): ItemCapability {
  return policyFor(kind).capability
}

/** Busy-channel duration scale from Repair competence. Evaluated once when a
 *  bout starts. Survival is not mixed in. */
export function campRepairDurationScale(repairSkillValue: number): number {
  const v = Math.max(0, Math.min(1, repairSkillValue))
  return 1 - CAMP_REPAIR_DURATION_CUT * v
}

export function campRepairXp(acceptedWork: number): number {
  if (!(acceptedWork > 0)) return 0
  return acceptedWork * CAMP_REPAIR_XP_PER_WORK_HOUR
}
