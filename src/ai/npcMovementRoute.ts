/**
 * NPC movement route composition and mouth-transition policy (plan npc-027
 * stage 2). Decision code still chooses WHERE; this module decides HOW to
 * walk surface/cave legs without owning cave topology or heightfields.
 *
 * @domain npc
 */

import type { CaveTraversalDescriptor, CaveTraversalPoint } from '../world/caves/caveHabitat'
import type { NpcMovementTarget, NpcWorldMovementQueries } from './npcMovementTarget'
import { copyVec3, type Vec3 } from '../simulation'
import {
  caveSpatialContext,
  spatialContextsEqual,
  WORLD_SPATIAL_CONTEXT_SURFACE,
  type WorldSpatialContext,
} from '../world/spatialContext'

export type NpcRouteLeg =
  | { kind: 'move', point: Vec3 }
  | { kind: 'enterCave', caveId: string, approach: Vec3, inward: Vec3 }
  | { kind: 'exitCave', caveId: string, inward: Vec3, approach: Vec3 }

/**
 * Composed execution route. `finalTarget` is the committed destination and
 * must stay unchanged while temporary entrance/topology legs run.
 *
 * @domain npc
 */
export type NpcComposedRoute = {
  finalTarget: NpcMovementTarget
  legs: readonly NpcRouteLeg[]
}

export type NpcMouthExecutionPhase = 'approach' | 'crossing'

export type NpcRouteExecution = {
  legIndex: number
  mouthPhase: NpcMouthExecutionPhase | null
}

export const INITIAL_NPC_ROUTE_EXECUTION: NpcRouteExecution = { legIndex: 0, mouthPhase: null }

const POINT_MERGE = 0.35

export type ComposeNpcMovementRouteInput = {
  currentPosition: Vec3
  currentContext: WorldSpatialContext
  target: NpcMovementTarget
  queries: NpcWorldMovementQueries
  entityHeight: number
}

function asVec3(point: { x: number, y: number, z: number }): Vec3 {
  return { x: point.x, y: point.y, z: point.z }
}

function xzDist(a: { x: number, z: number }, b: { x: number, z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function near3(
  a: { x: number, y: number, z: number },
  b: { x: number, y: number, z: number },
  eps = POINT_MERGE,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= eps
}

function copyTarget(target: NpcMovementTarget): NpcMovementTarget {
  return {
    position: copyVec3(target.position),
    context: target.context.kind === 'surface'
      ? WORLD_SPATIAL_CONTEXT_SURFACE
      : caveSpatialContext(target.context.caveId),
  }
}

function entrancePoint(descriptor: CaveTraversalDescriptor): Vec3 {
  return { x: descriptor.entrance.x, y: descriptor.entrance.y, z: descriptor.entrance.z }
}

/** First interior waypoint on home→entrance (the step just inside the mouth). */
function inwardFromRoute(descriptor: CaveTraversalDescriptor): Vec3 {
  const route = descriptor.routeToEntrance
  if (route.length >= 2) return asVec3(route[route.length - 2]!)
  return asVec3(descriptor.home)
}

function appendMoveLegs(
  legs: NpcRouteLeg[],
  points: readonly { x: number, y: number, z: number }[],
  skip: readonly { x: number, y: number, z: number }[],
): void {
  for (const point of points) {
    if (skip.some((s) => near3(point, s))) continue
    const last = legs[legs.length - 1]
    if (last?.kind === 'move' && near3(last.point, point)) continue
    legs.push({ kind: 'move', point: asVec3(point) })
  }
}

function ensureFinalMove(legs: NpcRouteLeg[], target: NpcMovementTarget): void {
  const last = legs[legs.length - 1]
  if (last?.kind === 'move' && near3(last.point, target.position)) return
  legs.push({ kind: 'move', point: copyVec3(target.position) })
}

function habitatOf(
  queries: NpcWorldMovementQueries,
  caveId: string,
  entityHeight: number,
): CaveTraversalDescriptor | null {
  return queries.resolveHabitat(caveId, entityHeight)
}

function routeBetween(
  queries: NpcWorldMovementQueries,
  caveId: string,
  from: { x: number, y: number, z: number },
  to: { x: number, y: number, z: number },
): readonly CaveTraversalPoint[] | null {
  return queries.resolveRouteBetweenPoints(caveId, from, to)
}

/**
 * Compose same-domain and surface↔cave movement legs. `null` when a cave
 * habitat/route cannot be resolved — callers must not invent a geometric
 * shortcut. Presentation/streaming is never consulted.
 *
 * @domain npc
 */
export function composeNpcMovementRoute(input: ComposeNpcMovementRouteInput): NpcComposedRoute | null {
  const finalTarget = copyTarget(input.target)
  const { currentContext, currentPosition, queries, entityHeight } = input

  if (currentContext.kind === 'surface' && finalTarget.context.kind === 'surface') {
    return { finalTarget, legs: [{ kind: 'move', point: copyVec3(finalTarget.position) }] }
  }

  if (currentContext.kind === 'surface' && finalTarget.context.kind === 'cave') {
    const caveId = finalTarget.context.caveId
    const habitat = habitatOf(queries, caveId, entityHeight)
    if (!habitat) return null
    const approach = entrancePoint(habitat)
    const inward = inwardFromRoute(habitat)
    const interior = routeBetween(queries, caveId, approach, finalTarget.position)
    if (!interior) return null
    const legs: NpcRouteLeg[] = [
      { kind: 'enterCave', caveId, approach, inward },
    ]
    appendMoveLegs(legs, interior, [approach, inward])
    ensureFinalMove(legs, finalTarget)
    return { finalTarget, legs }
  }

  if (currentContext.kind === 'cave' && finalTarget.context.kind === 'surface') {
    const caveId = currentContext.caveId
    const habitat = habitatOf(queries, caveId, entityHeight)
    if (!habitat) return null
    const approach = entrancePoint(habitat)
    const inward = inwardFromRoute(habitat)
    const toEntrance = routeBetween(queries, caveId, currentPosition, approach)
    if (!toEntrance) return null
    const legs: NpcRouteLeg[] = []
    appendMoveLegs(legs, toEntrance, [approach])
    legs.push({ kind: 'exitCave', caveId, inward, approach })
    ensureFinalMove(legs, finalTarget)
    return { finalTarget, legs }
  }

  if (currentContext.kind === 'cave' && finalTarget.context.kind === 'cave') {
    if (currentContext.caveId !== finalTarget.context.caveId) return null
    const interior = routeBetween(queries, currentContext.caveId, currentPosition, finalTarget.position)
    if (!interior) return null
    const legs: NpcRouteLeg[] = []
    appendMoveLegs(legs, interior, [currentPosition])
    ensureFinalMove(legs, finalTarget)
    return { finalTarget, legs }
  }

  return null
}

export function mouthTransitionDesiredContext(
  leg: Extract<NpcRouteLeg, { kind: 'enterCave' | 'exitCave' }>,
): WorldSpatialContext {
  return leg.kind === 'enterCave' ? caveSpatialContext(leg.caveId) : WORLD_SPATIAL_CONTEXT_SURFACE
}

/**
 * Context confirmation for a mouth leg. Proximity to the entrance is not an
 * input — only actual `spatialContextAt` output.
 *
 * @domain npc
 */
export function isMouthTransitionConfirmed(
  leg: Extract<NpcRouteLeg, { kind: 'enterCave' | 'exitCave' }>,
  actualContext: WorldSpatialContext,
): boolean {
  return spatialContextsEqual(mouthTransitionDesiredContext(leg), actualContext)
}

export type NpcRouteSteerResult = {
  steer: Vec3
  execution: NpcRouteExecution
  complete: boolean
}

/**
 * Monotonic cursor over composed legs. Mouth legs stay in `crossing` until
 * `spatialContextAt` matches the desired side — never because the NPC is
 * merely near the mouth.
 *
 * @domain npc
 */
export function nextNpcRouteSteer(
  route: NpcComposedRoute,
  execution: NpcRouteExecution,
  position: Vec3,
  actualContext: WorldSpatialContext,
  arrive: number,
): NpcRouteSteerResult {
  let legIndex = execution.legIndex
  let mouthPhase = execution.mouthPhase

  while (legIndex < route.legs.length) {
    const leg = route.legs[legIndex]!
    if (leg.kind === 'move') {
      if (xzDist(position, leg.point) <= arrive) {
        legIndex += 1
        mouthPhase = null
        continue
      }
      return { steer: leg.point, execution: { legIndex, mouthPhase: null }, complete: false }
    }

    if (mouthPhase === 'crossing' && isMouthTransitionConfirmed(leg, actualContext)) {
      legIndex += 1
      mouthPhase = null
      continue
    }

    const first = leg.kind === 'enterCave' ? leg.approach : leg.inward
    const second = leg.kind === 'enterCave' ? leg.inward : leg.approach
    if (mouthPhase !== 'crossing' && xzDist(position, first) > arrive) {
      return { steer: first, execution: { legIndex, mouthPhase: 'approach' }, complete: false }
    }
    return { steer: second, execution: { legIndex, mouthPhase: 'crossing' }, complete: false }
  }

  if (xzDist(position, route.finalTarget.position) > arrive) {
    return {
      steer: copyVec3(route.finalTarget.position),
      execution: { legIndex, mouthPhase: null },
      complete: false,
    }
  }
  if (!spatialContextsEqual(actualContext, route.finalTarget.context)) {
    return {
      steer: copyVec3(route.finalTarget.position),
      execution: { legIndex, mouthPhase: null },
      complete: false,
    }
  }
  return {
    steer: copyVec3(route.finalTarget.position),
    execution: { legIndex, mouthPhase: null },
    complete: true,
  }
}

/** Ground Y for the active leg — already floor-snapped by cave traversal. */
export function npcRouteGroundY(
  route: NpcComposedRoute,
  execution: NpcRouteExecution,
): number | null {
  const leg = route.legs[execution.legIndex]
  if (!leg) return route.finalTarget.position.y
  if (leg.kind === 'move') return leg.point.y
  if (execution.mouthPhase === 'crossing') {
    return leg.kind === 'enterCave' ? leg.inward.y : leg.approach.y
  }
  return leg.kind === 'enterCave' ? leg.approach.y : leg.inward.y
}
