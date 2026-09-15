/**
 * Cave-owned semantic interior placement candidates (plan world-018).
 *
 * Resource content scoring/selection lives in the world-resource layer;
 * this module only exposes Cave V2 topology + heightfield floor/clearance
 * /connectivity. Independent of presentation meshes.
 *
 * @domain world
 */

import type { CaveHeightfieldRepresentation, SurfaceSampler } from './caveHeightfieldRepresentation'
import type { CaveTopology, CaveTopologyNodeKind } from './caveTopology'
import { PLAYER_HEIGHT } from '../../player/playerDimensions'
import { shortestNodePath } from './caveHabitat'
import {
  chamberCandidates,
  incomingHeading,
} from './caveHeightfieldPlacement'
import {
  heightfieldGroundColumn,
  heightfieldOccupancyAt,
  heightfieldStandingClearance,
} from './caveHeightfieldQuery'

const PLACEMENT_KINDS = new Set<CaveTopologyNodeKind>(['chamber', 'widening'])
const OFFSETS_PER_NODE = 6
const CONSTRICTION_CLEARANCE = 2.2
const ENTRANCE_CLEARANCE = 4

export type CaveInteriorPlacementCandidate = {
  nodeId: string
  kind: 'chamber' | 'widening'
  x: number
  y: number
  z: number
  targetWidth: number
  /** Topology hops from the entrance node. */
  depthFromEntrance: number
}

/**
 * Semantic interior nodes with authoritative heightfield floor Y, already
 * filtered to connected, standable, non-mouth space.
 *
 * @domain world
 */
export type CaveInteriorPlacementView = {
  caveId: string
  entrance: { x: number, y: number, z: number, yaw: number }
  candidates: readonly CaveInteriorPlacementCandidate[]
}

function standableFloorAt(
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  x: number,
  z: number,
  entityHeight: number,
): number | null {
  const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, x, z)
  if (!column || column.openSky) return null
  if (column.ceilingY - column.floorY < heightfieldStandingClearance(entityHeight)) return null
  const occupancy = heightfieldOccupancyAt(heightfield, surfaceHeightAt, x, column.floorY, z)
  if (!occupancy || occupancy.openSky) return null
  return column.floorY
}

function tooCloseToConstriction(topology: CaveTopology, x: number, z: number): boolean {
  for (const node of topology.nodes) {
    if (node.kind !== 'constriction') continue
    if (Math.hypot(node.position.x - x, node.position.z - z) < CONSTRICTION_CLEARANCE) return true
  }
  return false
}

function entranceNodeId(topology: CaveTopology): string | null {
  return topology.nodes.find((node) => node.kind === 'entrance')?.id ?? topology.nodes[0]?.id ?? null
}

/**
 * Resolves standable chamber/widening candidates for one cave from its
 * retained topology and heightfield. Empty `candidates` when nothing is
 * safely placeable — callers may then fall back to fewer deposit slots.
 *
 * @domain world
 */
export function resolveCaveInteriorPlacementView(
  topology: CaveTopology,
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  entityHeight: number = PLAYER_HEIGHT,
): CaveInteriorPlacementView {
  const entranceId = entranceNodeId(topology)
  const entrance = topology.entrance
  const candidates: CaveInteriorPlacementCandidate[] = []
  if (!entranceId) {
    return {
      caveId: topology.caveId,
      entrance: { x: entrance.x, y: entrance.y, z: entrance.z, yaw: entrance.yaw },
      candidates,
    }
  }

  for (const node of topology.nodes) {
    if (!PLACEMENT_KINDS.has(node.kind)) continue
    const path = shortestNodePath(topology, entranceId, node.id)
    if (!path) continue
    const depthFromEntrance = path.length - 1
    if (depthFromEntrance <= 0) continue
    if (Math.hypot(node.position.x - entrance.x, node.position.z - entrance.z) < ENTRANCE_CLEARANCE) continue

    const incoming = incomingHeading(topology, node.id)
    const offsets = chamberCandidates(node, incoming, 1, OFFSETS_PER_NODE)
    for (const offset of offsets) {
      if (tooCloseToConstriction(topology, offset.x, offset.z)) continue
      const floorY = standableFloorAt(heightfield, surfaceHeightAt, offset.x, offset.z, entityHeight)
      if (floorY == null) continue
      candidates.push({
        nodeId: node.id,
        kind: node.kind as 'chamber' | 'widening',
        x: offset.x,
        y: floorY,
        z: offset.z,
        targetWidth: node.targetWidth,
        depthFromEntrance,
      })
    }
  }

  return {
    caveId: topology.caveId,
    entrance: { x: entrance.x, y: entrance.y, z: entrance.z, yaw: entrance.yaw },
    candidates,
  }
}
