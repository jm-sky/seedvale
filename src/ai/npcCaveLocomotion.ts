/**
 * Domain-aware cave-local NPC locomotion (plan npc-027 stage 3). Surface
 * steering stays on `stepWithSlopeAndCollision`; underground steps go through
 * `Caves.resolveHorizontalIn` + `queryGroundIn` via the injected query
 * bundle. Not a second mover — NpcAgent still owns `steerTo`.
 *
 * @domain npc
 */

import type { WorldSpatialContext } from '../world/spatialContext'
import type { NpcComposedRoute, NpcMouthExecutionPhase, NpcRouteExecution, NpcRouteLeg } from './npcMovementRoute'
import type { NpcWorldMovementQueries } from './npcMovementTarget'

/** Heightfield queries used by one cave step — subset of the NPC facade. */
export type NpcCaveLocomotionQueries = Pick<NpcWorldMovementQueries, 'queryGroundIn' | 'resolveHorizontalIn'>

/**
 * Cave-local steering applies while the NPC is actually in a cave, or while
 * a mouth crossing is in flight (open-sky mouth still reports surface).
 *
 * @domain npc
 */
export function shouldUseNpcCaveLocomotion(
  currentContext: WorldSpatialContext,
  mouthPhase: NpcMouthExecutionPhase | null,
): boolean {
  return currentContext.kind === 'cave' || mouthPhase === 'crossing'
}

/**
 * Cave identity for heightfield queries. Membership is `spatialContextAt`;
 * during mouth crossing the active enter/exit leg carries the intended id.
 *
 * @domain npc
 */
export function npcActiveCaveId(
  currentContext: WorldSpatialContext,
  route: Pick<NpcComposedRoute, 'legs'> | null,
  execution: NpcRouteExecution,
): string | null {
  if (currentContext.kind === 'cave') return currentContext.caveId
  if (execution.mouthPhase !== 'crossing' || !route) return null
  const leg: NpcRouteLeg | undefined = route.legs[execution.legIndex]
  if (leg?.kind === 'enterCave' || leg?.kind === 'exitCave') return leg.caveId
  return null
}

export type NpcCaveStepInput = {
  caveId: string
  x: number
  z: number
  y: number
  wishX: number
  wishZ: number
  radius: number
  entityHeight: number
  queries: NpcCaveLocomotionQueries
  /** Optional world-object walkability after heightfield containment. */
  isWalkable?: (x: number, z: number) => boolean
}

/**
 * One horizontal cave step: wish XZ, then heightfield rock containment, then
 * optional collider walkability with X-then-Z fallback (same 3-tier shape as
 * surface `stepWithSlopeAndCollision`, without terrain slope).
 *
 * @domain npc
 */
export function stepNpcCaveHorizontal(input: NpcCaveStepInput): { x: number, z: number, moved: boolean } {
  const tryWish = (wishX: number, wishZ: number): { x: number, z: number } | null => {
    const resolved = input.queries.resolveHorizontalIn(
      input.caveId,
      input.x + wishX,
      input.z + wishZ,
      input.y,
      input.radius,
      input.entityHeight,
    )
    if (input.isWalkable && !input.isWalkable(resolved.x, resolved.z)) return null
    return resolved
  }
  const full = tryWish(input.wishX, input.wishZ)
  if (full) return { x: full.x, z: full.z, moved: full.x !== input.x || full.z !== input.z }
  const onlyX = tryWish(input.wishX, 0)
  if (onlyX) return { x: onlyX.x, z: onlyX.z, moved: onlyX.x !== input.x || onlyX.z !== input.z }
  const onlyZ = tryWish(0, input.wishZ)
  if (onlyZ) return { x: onlyZ.x, z: onlyZ.z, moved: onlyZ.x !== input.x || onlyZ.z !== input.z }
  return { x: input.x, z: input.z, moved: false }
}

/**
 * Authoritative cave floor at a point, or `null` outside that cave's void.
 *
 * @domain npc
 */
export function npcCaveGroundY(input: {
  caveId: string
  x: number
  y: number
  z: number
  queries: NpcCaveLocomotionQueries
}): number | null {
  return input.queries.queryGroundIn(input.caveId, input.x, input.y, input.z)?.floorY ?? null
}

/**
 * NPC-NPC separation candidate: resolve through heightfield, then require a
 * cave floor hit so a crowd nudge cannot leave the void or snap to surface.
 *
 * @domain npc
 */
export function acceptNpcCaveHorizontalCandidate(input: {
  caveId: string
  x: number
  z: number
  y: number
  radius: number
  entityHeight: number
  queries: NpcCaveLocomotionQueries
}): { x: number, z: number, y: number } | null {
  const resolved = input.queries.resolveHorizontalIn(
    input.caveId,
    input.x,
    input.z,
    input.y,
    input.radius,
    input.entityHeight,
  )
  const floorY = npcCaveGroundY({
    caveId: input.caveId,
    x: resolved.x,
    y: input.y,
    z: resolved.z,
    queries: input.queries,
  })
  if (floorY == null) return null
  return { x: resolved.x, z: resolved.z, y: floorY }
}
