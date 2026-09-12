import type { AnimalDef } from './animalDefs'
import { type FollowHysteresisState, resolveFollowHysteresis } from '../shared/followHysteresis'

/** Tighter trailing band than owned Follow (plan fauna-007) — a led animal
 *  stays close on the rope instead of ranging out to the household Follow
 *  start/stop distances. Shared by every leadable species unless `AnimalDef.lead`
 *  overrides them. */
export const LEAD_START_DISTANCE = 4.5
export const LEAD_STOP_DISTANCE = 2.2

export type LeadMovement =
  | { kind: 'follow', x: number, z: number }
  | { kind: 'none' }

/**
 * @domain fauna
 * @role Temporary player↔animal lead relation helpers. Presence of
 *  `AnimalDef.lead` is the leadable capability; this module never branches
 *  on `kind === 'horse'`.
 */
export function isLeadableDef(def: AnimalDef): boolean {
  return def.lead !== undefined
}

export function isDraftDef(def: AnimalDef): boolean {
  return def.draft !== undefined
}

export function leadStartDistance(def: AnimalDef): number {
  return def.lead?.startDistance ?? LEAD_START_DISTANCE
}

export function leadStopDistance(def: AnimalDef): number {
  return def.lead?.stopDistance ?? LEAD_STOP_DISTANCE
}

export function hitchDistanceFor(def: AnimalDef): number {
  return def.draft?.hitchDistance ?? 2.2
}

export function resolveLeadMovement(
  attached: boolean,
  hysteresis: FollowHysteresisState,
  animalPos: { x: number, z: number },
  playerPos: { x: number, z: number } | null | undefined,
  def: AnimalDef,
  mounted: boolean,
  dead: boolean,
  leadable = isLeadableDef(def),
): LeadMovement {
  if (!attached || dead || mounted || !leadable) return { kind: 'none' }
  return resolveFollowHysteresis(
    hysteresis,
    animalPos,
    playerPos,
    leadStartDistance(def),
    leadStopDistance(def),
  )
}
