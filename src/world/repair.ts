/**
 * Shared actor-neutral repair-progress primitives (plan world-021).
 * Owns only the work-math contract a world target uses while an episode is
 * active. Does not know materials, skill, actor, structure kind, ownership,
 * NPC assignment, or maintenance priority — those stay with the domain that
 * owns the repairable component.
 *
 * @domain world
 */

export type RepairProgress = {
  /** Resolved condition when this repair episode started. */
  startedCondition: number
  /** Condition the completed episode will write. May be below 100. */
  targetCondition: number
  /** Full amount of accepted work this episode needs. */
  requiredWork: number
  /** Accepted work already applied to this episode. */
  completedWork: number
}

/** Remaining accepted work this episode will still take. */
export function repairRemainingWork(progress: RepairProgress): number {
  return Math.max(0, progress.requiredWork - progress.completedWork)
}

export function isRepairComplete(progress: RepairProgress): boolean {
  return progress.completedWork >= progress.requiredWork
}

/**
 * Apply an actor-neutral work contribution. Zero/negative amounts are a no-op.
 * Accepted work never exceeds remaining work; `completedWork` never exceeds
 * `requiredWork`. The caller decides when to persist the returned progress
 * and when completion updates condition.
 *
 * @domain world
 */
export function applyRepairWork(
  progress: RepairProgress,
  workAmount: number,
): {
  progress: RepairProgress
  acceptedWork: number
} {
  if (workAmount <= 0) return { progress, acceptedWork: 0 }
  const remaining = repairRemainingWork(progress)
  const acceptedWork = Math.min(workAmount, remaining)
  if (acceptedWork <= 0) return { progress, acceptedWork: 0 }
  return {
    progress: {
      ...progress,
      completedWork: progress.completedWork + acceptedWork,
    },
    acceptedWork,
  }
}
