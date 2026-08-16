import { drainVigor, isCollapsed, restoreVigor, type VigorState } from '../shared/VigorState'

export const MAX_VIGOR = 100

/** Per real-second drain during heavy physical execute (`work` / `chop`). */
export const WORK_VIGOR_COST = 0.4

/** Lump cost applied once when the NPC takes real damage. */
export const DAMAGE_VIGOR_COST = 12

/** Per real-second restore while the NPC is actually in the `sleep` phase. */
export const SLEEP_VIGOR_RESTORE_RATE = 0.65

/**
 * Forced-sleep nap ends once vigor reaches this — high enough to avoid
 * collapsing again on the next work action, low enough to be a nap not a
 * full night.
 */
export const VIGOR_WAKE_THRESHOLD = 40

/** Walk home to sleep when at least this close; otherwise sleep in place. */
export const HOME_SLEEP_RANGE = 16

export type SleepReason = 'collapse' | 'schedule'

const HEAVY_WORK_KINDS = new Set(['chop', 'mine', 'work'])

export function isHeavyWorkKind(kind: string): boolean {
  return HEAVY_WORK_KINDS.has(kind)
}

export function applyWorkVigor(vigor: VigorState, dt: number): void {
  drainVigor(vigor, WORK_VIGOR_COST * dt)
}

export function applySleepVigor(vigor: VigorState, dt: number): void {
  restoreVigor(vigor, SLEEP_VIGOR_RESTORE_RATE * dt)
}

export function applyDamageVigor(vigor: VigorState): void {
  drainVigor(vigor, DAMAGE_VIGOR_COST)
}

export function shouldCollapseSleep(vigor: VigorState): boolean {
  return isCollapsed(vigor)
}

export function preferHomeSleep(distanceToHome: number): boolean {
  return distanceToHome <= HOME_SLEEP_RANGE
}

/**
 * Stay in the existing `goSleep`/`sleep` path while the schedule says sleep,
 * or while a collapse nap has not yet recovered to `VIGOR_WAKE_THRESHOLD`.
 */
export function shouldStayAsleep(
  vigor: VigorState,
  scheduledActivity: string,
  sleepReason: SleepReason | null,
): boolean {
  if (scheduledActivity === 'sleep') return true
  if (sleepReason === 'collapse') return vigor.current < VIGOR_WAKE_THRESHOLD
  return false
}

export type VigorStepResult = {
  /** Collapse nap still in progress after this step. */
  napping: boolean
  /** This step was spent sleeping (scheduled or forced), not working. */
  slept: boolean
}

/**
 * One simulated catch-up step used by `NpcAgent.resolveTimeSkip`.
 * Live `update()` uses the same `applyWorkVigor` / `applySleepVigor` rates.
 */
export function tickVigorForSimulatedStep(
  vigor: VigorState,
  activity: string,
  dt: number,
  napping: boolean,
): VigorStepResult {
  const sleepNow = activity === 'sleep' || napping || isCollapsed(vigor)
  if (sleepNow) {
    applySleepVigor(vigor, dt)
    if (activity === 'sleep') return { napping: false, slept: true }
    return { napping: vigor.current < VIGOR_WAKE_THRESHOLD, slept: true }
  }
  if (activity === 'work') applyWorkVigor(vigor, dt)
  return { napping: isCollapsed(vigor), slept: false }
}
