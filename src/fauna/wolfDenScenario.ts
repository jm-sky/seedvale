import type { PreySpawner } from './AnimalSpawner'
import { WOLF_DEN_ID } from './AnimalSpawner'

/** @domain fauna
 *  World-owned wolf-den pressure scenario (plan quests-progression-007) —
 *  pure helpers over `PreySpawner` fields; activation/trips stay in
 *  `createFauna.ts`. */

export const WOLF_DEN_PROBLEM_START_DAY = 2
export const WOLF_DEN_ACTIVE_PRESSURE = 0.75
/** Minimum game-days between settlement-directed trip opportunities per den. */
export const SETTLEMENT_TRIP_COOLDOWN_DAYS = 0.5
export const SETTLEMENT_TRIP_STAY_SEC = 45

export function lerp(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return a + (b - a) * clamped
}

/** Effective population cap while `pressure > 0`; baseline config unchanged. */
export function effectiveMaxPreyCount(spawner: PreySpawner): number {
  if (spawner.type !== 'wolfDen' || spawner.pressure <= 0) return spawner.maxPreyCount
  return spawner.maxPreyCount + Math.round(spawner.pressure * 4)
}

/** Finite respawn interval under pressure; `Infinity` when pressure is 0. */
export function effectiveRespawnIntervalDays(spawner: PreySpawner): number {
  if (spawner.type !== 'wolfDen' || spawner.pressure <= 0) return spawner.respawnIntervalDays
  return lerp(3.0, 1.5, spawner.pressure)
}

export function isWolfDenPermanentlyDestroyed(spawner: PreySpawner): boolean {
  return spawner.type === 'wolfDen' && spawner.state === 'disabled' && spawner.canRecover === false
}

/**
 * Authoritative settlement wolf-den threat: den pressure is live and the
 * habitat has not been permanently destroyed. Quest opportunities observe
 * this; they do not own it.
 *
 * @domain fauna
 */
export function isWolfDenPressureProblem(spawner: PreySpawner): boolean {
  return spawner.type === 'wolfDen' && spawner.pressure > 0 && !isWolfDenPermanentlyDestroyed(spawner)
}

/** Quest objectives may reference stable `WOLF_DEN_ID` instead of `${settlement}:wolfDen`. */
export function matchesQuestSpawnPointId(spawner: PreySpawner, questSpawnerId: string): boolean {
  if (questSpawnerId === WOLF_DEN_ID) return spawner.type === 'wolfDen'
  return spawner.id === questSpawnerId
}

export function isQuestSpawnPointPermanentlyDestroyed(
  spawners: readonly PreySpawner[],
  questSpawnerId: string,
): boolean {
  const spawner = spawners.find((s) => matchesQuestSpawnPointId(s, questSpawnerId))
  if (!spawner) return false
  return spawner.canRecover === false && spawner.state === 'disabled'
}

export function shouldActivateWolfDenProblem(spawner: PreySpawner, floorDay: number): boolean {
  if (spawner.type !== 'wolfDen') return false
  if (isWolfDenPermanentlyDestroyed(spawner)) return false
  if (spawner.pressure > 0) return false
  return floorDay >= WOLF_DEN_PROBLEM_START_DAY
}

export function activateWolfDenProblem(spawner: PreySpawner): void {
  spawner.pressure = WOLF_DEN_ACTIVE_PRESSURE
  spawner.humanTaste = true
}

export function canOfferSettlementTrip(spawner: PreySpawner, worldDays: number): boolean {
  if (spawner.type !== 'wolfDen' || spawner.pressure <= 0) return false
  if (spawner.state !== 'active') return false
  if (spawner.lastSettlementTripOpportunityDay == null) return true
  return worldDays - spawner.lastSettlementTripOpportunityDay >= SETTLEMENT_TRIP_COOLDOWN_DAYS
}

export function recordSettlementTripOpportunity(spawner: PreySpawner, worldDays: number): void {
  spawner.lastSettlementTripOpportunityDay = worldDays
}
