import type { PhysicalEffortIntensity, PlayerNeeds } from '../../player/PlayerNeeds'
import type { BusyAction } from '../busyAction'
import { physicalEffortStaminaCostPerSec, representedPhysicalEffortVigorPerHour } from '../../player/PlayerNeeds'
import { isStarving } from '../../shared/HungerState'
import { isDehydrated } from '../../shared/ThirstState'

/** One continuous player construction-work session (plan ui-input-016).
 *  Arms a single `BusyAction` for the nearest real stop boundary — target
 *  remaining work, stamina, vigor, or existing needs thresholds — rather
 *  than an arbitrary one-hour UX bout. Domain owners still apply progress
 *  through `contribute`. */
export type ConstructionWorkSessionSpec = {
  label: string
  remainingHours: number
  realSecondsPerRepresentedHour: number
  staminaEffort: PhysicalEffortIntensity
  vigorEffort: PhysicalEffortIntensity
  contribute: (hours: number) => void
}

/**
 * Represented hours the player can safely work right now, given live
 * stamina/vigor/needs and remaining target work. Returns 0 when a stop
 * condition is already active.
 *
 * @domain ui-input
 */
export function maxSafeConstructionHours(
  needs: PlayerNeeds,
  remainingHours: number,
  realSecondsPerRepresentedHour: number,
  staminaEffort: PhysicalEffortIntensity,
  vigorEffort: PhysicalEffortIntensity,
): number {
  if (remainingHours <= 0) return 0
  if (isStarving(needs.hunger) || isDehydrated(needs.thirst)) return 0
  if (needs.stamina.current <= 0 || needs.vigor.current <= 0) return 0
  const staminaPerHour = physicalEffortStaminaCostPerSec(staminaEffort) * realSecondsPerRepresentedHour
  const vigorPerHour = representedPhysicalEffortVigorPerHour(vigorEffort)
  const staminaHours = staminaPerHour > 0 ? needs.stamina.current / staminaPerHour : remainingHours
  const vigorHours = vigorPerHour > 0 ? needs.vigor.current / vigorPerHour : remainingHours
  return Math.max(0, Math.min(remainingHours, staminaHours, vigorHours) * 0.999)
}

/**
 * Starts one cancellable construction work session. Returns false when the
 * player cannot safely start (no remaining work or needs/stamina/vigor
 * already block). Escape credits only the elapsed fraction.
 *
 * @domain ui-input
 */
export function startConstructionWorkSession(
  busy: BusyAction,
  needs: PlayerNeeds,
  spec: ConstructionWorkSessionSpec,
): boolean {
  const hours = maxSafeConstructionHours(
    needs,
    spec.remainingHours,
    spec.realSecondsPerRepresentedHour,
    spec.staminaEffort,
    spec.vigorEffort,
  )
  if (hours <= 0) return false
  const sessionSec = hours * spec.realSecondsPerRepresentedHour
  const startedAt = performance.now()
  const credit = (fraction: number): void => {
    const creditedHours = hours * Math.max(0, Math.min(1, fraction))
    if (creditedHours <= 0) return
    spec.contribute(creditedHours)
  }
  busy.start(sessionSec, spec.label, () => {
    credit(1)
  }, {
    onCancel: () => {
      const elapsedSec = Math.min(sessionSec, Math.max(0, (performance.now() - startedAt) / 1000))
      credit(sessionSec > 0 ? elapsedSec / sessionSec : 1)
    },
    staminaCostPerSec: physicalEffortStaminaCostPerSec(spec.staminaEffort),
  })
  return true
}
