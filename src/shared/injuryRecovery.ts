import { damageHealth, healHealth, type HealthState } from './HealthState'
import {
  decreaseInjuryFromHeal,
  increaseInjuryFromDamage,
  naturalInjuryRecoveryHp,
  representativeInjuryAmount,
  type TreatableInjurySeverity,
} from './injurySeverity'

/**
 * @domain shared
 * @system health
 * @role Lazy elapsed-game-time natural injury recovery (plan npc-025).
 *  Recovery restores HP through `healHealth` and reduces `physicalInjury` by
 *  the actual restored amount. No global scan, no render-frame tick.
 */

/** Mutable injury + health + recovery-anchor fields used by lazy resolution. */
export type InjuryRecoveryState = {
  health: HealthState
  injuryRecoveryUpdatedAtDays?: number
  physicalInjury: number
}

function setRecoveryAnchor(state: InjuryRecoveryState, nowDays: number): void {
  state.injuryRecoveryUpdatedAtDays = nowDays
}

/**
 * Advances outstanding physical injury by elapsed game days. Missing anchors
 * (older snapshots) initialize to `nowDays` without retroactive recovery.
 * Dead actors and non-positive injury are no-ops besides refreshing the
 * anchor. Idempotent when called twice at the same `nowDays`.
 */
export function resolveInjuryRecovery(state: InjuryRecoveryState, nowDays: number): void {
  if (state.health.dead) {
    setRecoveryAnchor(state, nowDays)
    return
  }
  if (state.physicalInjury <= 0) {
    state.physicalInjury = 0
    setRecoveryAnchor(state, nowDays)
    return
  }
  const updatedAt = state.injuryRecoveryUpdatedAtDays
  if (updatedAt == null) {
    setRecoveryAnchor(state, nowDays)
    return
  }
  const elapsedDays = nowDays - updatedAt
  if (elapsedDays <= 0) {
    if (elapsedDays === 0) return
    setRecoveryAnchor(state, nowDays)
    return
  }
  const requested = naturalInjuryRecoveryHp(state.physicalInjury, state.health.maxHp, elapsedDays)
  const hpBefore = state.health.currentHp
  healHealth(state.health, requested)
  const actualRestored = state.health.currentHp - hpBefore
  state.physicalInjury = decreaseInjuryFromHeal(state.physicalInjury, actualRestored)
  setRecoveryAnchor(state, nowDays)
}

/** Registers accepted physical HP loss after `damageHealth`. Resolves elapsed
 *  recovery first so a later hit does not skip idle recovery. */
export function registerPhysicalInjuryFromDamage(
  state: InjuryRecoveryState,
  actualHpLoss: number,
  nowDays: number,
): void {
  resolveInjuryRecovery(state, nowDays)
  state.physicalInjury = increaseInjuryFromDamage(state.physicalInjury, actualHpLoss)
  setRecoveryAnchor(state, nowDays)
}

/** Registers actual restored HP from immediate treatment. */
export function registerPhysicalInjuryFromHeal(
  state: InjuryRecoveryState,
  actualHpRestored: number,
  nowDays: number,
): void {
  resolveInjuryRecovery(state, nowDays)
  state.physicalInjury = decreaseInjuryFromHeal(state.physicalInjury, actualHpRestored)
  setRecoveryAnchor(state, nowDays)
}

/**
 * Debug/test helper — moves injury (and matching HP) to a representative
 * amount for `severity` using the same damage/heal accounting as gameplay.
 * Never kills the actor.
 */
export function applyInjurySeverityForDebug(
  state: InjuryRecoveryState,
  severity: TreatableInjurySeverity | 'none',
  nowDays: number,
): void {
  resolveInjuryRecovery(state, nowDays)
  if (state.health.dead) return
  const target = severity === 'none'
    ? 0
    : representativeInjuryAmount(severity, state.health.maxHp)
  const current = state.physicalInjury
  if (target > current) {
    const gap = target - current
    const hpBefore = state.health.currentHp
    const maxLoss = Math.max(0, hpBefore - 1)
    damageHealth(state.health, Math.min(gap, maxLoss))
    const actualLoss = hpBefore - state.health.currentHp
    state.physicalInjury = increaseInjuryFromDamage(current, actualLoss)
  } else if (target < current) {
    const gap = current - target
    const hpBefore = state.health.currentHp
    healHealth(state.health, gap)
    const actualRestored = state.health.currentHp - hpBefore
    state.physicalInjury = decreaseInjuryFromHeal(current, actualRestored)
  }
  setRecoveryAnchor(state, nowDays)
}
