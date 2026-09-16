import type { CaveTraversalDescriptor, CaveTraversalPoint } from '../world/caves/caveHabitat'
import type { NpcPlannedAction } from './npcAction'
import { copyVec3, type Vec3 } from '../simulation'
import {
  caveSpatialContext,
  spatialContextsEqual,
  WORLD_SPATIAL_CONTEXT_SURFACE,
  type WorldSpatialContext,
} from '../world/spatialContext'

/**
 * Authoritative NPC movement commitment: world-space XYZ plus shared spatial
 * identity. Derived at the movement execution boundary from `NpcPlannedAction`.
 *
 * @domain npc
 */
export type NpcMovementTarget = {
  position: Vec3
  context: WorldSpatialContext
}

/**
 * Narrow world/cave semantic queries for NPC movement — no `WorldBundle` or
 * raw heightfield maps. Route composition uses habitat + point-to-point
 * traversal; current membership is always `spatialContextAt`.
 *
 * @domain npc
 */
export type NpcWorldMovementQueries = {
  spatialContextAt: (x: number, y: number, z: number) => WorldSpatialContext
  resolveHabitat: (
    caveId: string,
    entityHeight: number,
  ) => CaveTraversalDescriptor | null
  resolveRouteBetweenPoints: (
    caveId: string,
    from: { x: number, y: number, z: number },
    to: { x: number, y: number, z: number },
  ) => readonly CaveTraversalPoint[] | null
}

export type NpcMovementTargetSource = Pick<NpcPlannedAction, 'destination' | 'destinationContext'>

/**
 * Single normalization boundary: legacy surface producers pass only
 * `destination`; explicit cave targets may set `destinationContext`.
 *
 * @domain npc
 */
export function normalizeNpcMovementTarget(
  action: NpcMovementTargetSource,
  spatialContextAt: NpcWorldMovementQueries['spatialContextAt'],
): NpcMovementTarget {
  const position = copyVec3(action.destination)
  const context = action.destinationContext
    ?? spatialContextAt(position.x, position.y, position.z)
  return { position, context }
}

/**
 * Immutable committed snapshot for the current movement step — copies position
 * and canonicalizes context values so later mutation of `action.destination`
 * cannot alter the commitment.
 *
 * @domain npc
 */
export function commitNpcMovementTarget(
  action: NpcMovementTargetSource,
  spatialContextAt: NpcWorldMovementQueries['spatialContextAt'],
): NpcMovementTarget {
  const normalized = normalizeNpcMovementTarget(action, spatialContextAt)
  return {
    position: copyVec3(normalized.position),
    context: canonicalizeSpatialContext(normalized.context),
  }
}

/** Semantic equality for committed targets — never compare context by reference. */
export function movementTargetsEqual(a: NpcMovementTarget, b: NpcMovementTarget): boolean {
  return a.position.x === b.position.x
    && a.position.y === b.position.y
    && a.position.z === b.position.z
    && spatialContextsEqual(a.context, b.context)
}

function canonicalizeSpatialContext(context: WorldSpatialContext): WorldSpatialContext {
  if (context.kind === 'surface') return WORLD_SPATIAL_CONTEXT_SURFACE
  return caveSpatialContext(context.caveId)
}

/** Isolated fallbacks and tests — always resolves surface. */
export const NPC_WORLD_MOVEMENT_SURFACE_ONLY: NpcWorldMovementQueries = {
  spatialContextAt: () => WORLD_SPATIAL_CONTEXT_SURFACE,
  resolveHabitat: () => null,
  resolveRouteBetweenPoints: () => null,
}
