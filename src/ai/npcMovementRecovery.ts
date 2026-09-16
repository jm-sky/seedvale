/**
 * Context-safe NPC stuck recovery and time-skip placement (plan npc-027
 * stage 4). Generic rescue never changes `WorldSpatialContext`; underground
 * NPCs are never surface-projected at the same X/Z.
 *
 * Time skip does **not** execute cave routes or mouth crossings. If the NPC
 * is in a cave (or a mouth-crossing phase), placement holds the current
 * cave-valid XYZ — a documented limitation, not an implicit surface fallback.
 *
 * @domain npc
 */

import type { WorldSpatialContext } from '../world/spatialContext'
import type { NpcComposedRoute, NpcMouthExecutionPhase, NpcRouteExecution } from './npcMovementRoute'
import type { NpcWorldMovementQueries } from './npcMovementTarget'
import { PLAYER_COLLISION_RADIUS } from '../player/playerDimensions'
import {
  acceptNpcCaveHorizontalCandidate,
  npcActiveCaveId,
  npcCaveGroundY,
  type NpcCaveLocomotionQueries,
  shouldUseNpcCaveLocomotion,
} from './npcCaveLocomotion'

/** Watchdog order while the NPC is in a cave-recovery domain. */
export const CAVE_RECOVERY_SEQUENCE = [
  'retry-current-leg',
  'rebuild-route',
  'local-escape',
  'abandon',
] as const

export type CaveRecoveryStep = (typeof CAVE_RECOVERY_SEQUENCE)[number]

export type NpcTimeSkipPlacementPolicy = 'surface-schedule' | 'hold-cave-endpoint'

const CAVE_ESCAPE_RING_RADII = [1.5, 3, 4.5] as const

export function usesCaveRecoveryDomain(
  currentContext: WorldSpatialContext,
  mouthPhase: NpcMouthExecutionPhase | null,
): boolean {
  return shouldUseNpcCaveLocomotion(currentContext, mouthPhase)
}

/**
 * Surface emergency teleport / plaza snap is allowed only when the NPC is
 * actually on the surface and not mid mouth-crossing.
 *
 * @domain npc
 */
export function allowsEmergencySurfaceReposition(
  currentContext: WorldSpatialContext,
  mouthPhase: NpcMouthExecutionPhase | null,
): boolean {
  return !usesCaveRecoveryDomain(currentContext, mouthPhase)
}

export function caveIdForRecovery(
  currentContext: WorldSpatialContext,
  route: Pick<NpcComposedRoute, 'legs'> | null,
  execution: NpcRouteExecution,
): string | null {
  return npcActiveCaveId(currentContext, route, execution)
}

/**
 * Ring sampler inside one cave. Each candidate is heightfield-contained and
 * must still resolve as the same `caveId` — never `sampleHeight`.
 *
 * @domain npc
 */
export function sampleCaveLocalEscape(input: {
  caveId: string
  x: number
  y: number
  z: number
  queries: NpcWorldMovementQueries
  entityHeight: number
  radius?: number
  radii?: readonly number[]
  samplesPerRing?: number
}): { x: number, y: number, z: number } | null {
  const radii = input.radii ?? CAVE_ESCAPE_RING_RADII
  const samples = input.samplesPerRing ?? 8
  const bodyRadius = input.radius ?? PLAYER_COLLISION_RADIUS
  for (const ring of radii) {
    for (let i = 0; i < samples; i++) {
      const ang = (i / samples) * Math.PI * 2
      const nx = input.x + Math.cos(ang) * ring
      const nz = input.z + Math.sin(ang) * ring
      const accepted = acceptNpcCaveHorizontalCandidate({
        caveId: input.caveId,
        x: nx,
        z: nz,
        y: input.y,
        radius: bodyRadius,
        entityHeight: input.entityHeight,
        queries: input.queries,
      })
      if (!accepted) continue
      const ctx = input.queries.spatialContextAt(accepted.x, accepted.y, accepted.z)
      if (ctx.kind !== 'cave' || ctx.caveId !== input.caveId) continue
      return accepted
    }
  }
  return null
}

/**
 * Time-skip / catch-up placement.
 *
 * - Surface: existing schedule/travel XZ + terrain `sampleHeight`.
 * - Cave or mouth crossing: hold current XZ, ground with `queryGroundIn`.
 *   Never walk a cave route, never project to surface Y at this X/Z.
 *
 * @domain npc
 */
export function placeNpcAfterTimeSkip(input: {
  current: { x: number, y: number, z: number }
  scheduleTarget: { x: number, z: number }
  currentContext: WorldSpatialContext
  mouthPhase: NpcMouthExecutionPhase | null
  route: Pick<NpcComposedRoute, 'legs'> | null
  execution: NpcRouteExecution
  queries: NpcCaveLocomotionQueries
  sampleHeight: (x: number, z: number) => number
}): { x: number, y: number, z: number, policy: NpcTimeSkipPlacementPolicy } {
  if (usesCaveRecoveryDomain(input.currentContext, input.mouthPhase)) {
    const caveId = caveIdForRecovery(input.currentContext, input.route, input.execution)
    const floorY = caveId
      ? npcCaveGroundY({
        caveId,
        x: input.current.x,
        y: input.current.y,
        z: input.current.z,
        queries: input.queries,
      })
      : null
    return {
      x: input.current.x,
      y: floorY ?? input.current.y,
      z: input.current.z,
      policy: 'hold-cave-endpoint',
    }
  }
  return {
    x: input.scheduleTarget.x,
    y: input.sampleHeight(input.scheduleTarget.x, input.scheduleTarget.z),
    z: input.scheduleTarget.z,
    policy: 'surface-schedule',
  }
}
