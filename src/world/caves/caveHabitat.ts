/** World-owned cave traversal contract (plan fauna-019) — resolves a stable
 *  interior home anchor and an entrance route for one real, walk-in cave
 *  from its already-built `CaveTopology` and retained
 *  `CaveHeightfieldRepresentation`. This is the missing piece the plan
 *  identified: not a second spatial representation, but a narrow cave-scoped
 *  read over the existing one, so fauna (or anything else caves-aware) can
 *  ask "where is this cave's interior, and how do I walk to its mouth"
 *  without touching `CaveRuntime`, raw heightfield arrays or presentation.
 *
 *  Every floor/clearance number here delegates to `caveHeightfieldQuery.ts` —
 *  this module only picks *which* topology node is home and *which* segments
 *  connect it to the entrance.
 *
 * @domain world-terrain
 */

import type { CaveHeightfieldRepresentation, SurfaceSampler } from './caveHeightfieldRepresentation'
import type { CaveTopology, CaveTopologyNode, CaveTopologyPoint } from './caveTopology'
import { heightfieldGroundColumn, heightfieldStandingClearance } from './caveHeightfieldQuery'

export type CaveTraversalPoint = { x: number, y: number, z: number }

/**
 * Resolved, cacheable habitat descriptor for one cave. Not persisted
 * (plan fauna-019 §10) — always re-derived from `caveId` + the deterministic
 * topology/heightfield, so a caller may cache the returned object for the
 * lifetime of one `WorldBundle` but must re-resolve after any rebuild.
 *
 * @domain world-terrain
 */
export type CaveTraversalDescriptor = {
  caveId: string
  entrance: CaveTraversalPoint & { yaw: number }
  home: CaveTraversalPoint
  /** Ordered waypoints from `home` to `entrance`, inclusive of both ends. */
  routeToEntrance: readonly CaveTraversalPoint[]
}

function standableFloorAt(
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  point: { x: number, z: number },
  entityHeight: number,
): number | null {
  const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, point.x, point.z)
  if (!column) return null
  const clearance = column.ceilingY - column.floorY
  return clearance >= heightfieldStandingClearance(entityHeight) ? column.floorY : null
}

/**
 * Deterministic home-chamber candidate order: the literal `id === 'chamber'`
 * node first (the natural recipe's one main chamber), then every other
 * `kind === 'chamber'` node in `CaveTopology.nodes`' own stable array order.
 * That order already *is* route order — both recipes push a chamber's node
 * only once its connecting segment has been walked — so the adventure
 * recipe's main-route chamber (`adventure-chamber-1`) is always tried before
 * its deeper/side chambers without a second graph search here. Dungeon uses
 * the same generic chamber walk.
 *
 * @domain world-terrain
 */
function homeChamberCandidates(topology: CaveTopology): readonly CaveTopologyNode[] {
  const literal = topology.nodes.find((n) => n.id === 'chamber')
  const rest = topology.nodes.filter((n) => n.kind === 'chamber' && n.id !== 'chamber')
  return literal ? [literal, ...rest] : rest
}

function resolveHomeNode(
  topology: CaveTopology,
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  entityHeight: number,
): { node: CaveTopologyNode, floorY: number } | null {
  for (const node of homeChamberCandidates(topology)) {
    const floorY = standableFloorAt(heightfield, surfaceHeightAt, node.position, entityHeight)
    if (floorY != null) return { node, floorY }
  }
  return null
}

/**
 * Shortest node path over the topology's segment graph (plain BFS — the
 * graph is a handful of nodes, never a navmesh/A* grid problem per plan
 * fauna-019 §3). Segment order is deterministic generation order and a `Map`
 * preserves insertion order, so neighbour expansion — and therefore the
 * chosen path on a topology with more than one route — is deterministic too.
 *
 * @domain world-terrain
 */
function shortestNodePath(topology: CaveTopology, fromId: string, toId: string): readonly string[] | null {
  if (fromId === toId) return [fromId]
  const adjacency = new Map<string, string[]>()
  for (const segment of topology.segments) {
    if (!adjacency.has(segment.from)) adjacency.set(segment.from, [])
    if (!adjacency.has(segment.to)) adjacency.set(segment.to, [])
    adjacency.get(segment.from)!.push(segment.to)
    adjacency.get(segment.to)!.push(segment.from)
  }
  const cameFrom = new Map<string, string>()
  const visited = new Set<string>([fromId])
  const queue: string[] = [fromId]
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi]!
    if (current === toId) break
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      cameFrom.set(neighbor, current)
      queue.push(neighbor)
    }
  }
  if (!visited.has(toId)) return null
  const path: string[] = [toId]
  let cursor = toId
  while (cursor !== fromId) {
    const prev = cameFrom.get(cursor)
    if (!prev) return null
    path.push(prev)
    cursor = prev
  }
  path.reverse()
  return path
}

function segmentBetween(
  topology: CaveTopology,
  a: string,
  b: string,
): { centerline: readonly CaveTopologyPoint[], reversed: boolean } | null {
  for (const segment of topology.segments) {
    if (segment.from === a && segment.to === b) return { centerline: segment.centerline, reversed: false }
    if (segment.from === b && segment.to === a) return { centerline: segment.centerline, reversed: true }
  }
  return null
}

/** Flattens the segment centerlines along `nodePath` into one polyline
 *  (plan fauna-019 §3) — each segment's `centerline` already starts/ends
 *  exactly at its connected nodes' positions, so touching endpoints are
 *  deduplicated by skipping a segment's first point once the path already
 *  holds it. `null` only if `nodePath` names a pair with no direct segment,
 *  which cannot happen for a path `shortestNodePath` itself produced. */
function buildRoutePoints(topology: CaveTopology, nodePath: readonly string[]): CaveTopologyPoint[] | null {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const first = nodeById.get(nodePath[0]!)
  if (!first) return null
  const points: CaveTopologyPoint[] = [first.position]
  for (let i = 0; i < nodePath.length - 1; i++) {
    const segment = segmentBetween(topology, nodePath[i]!, nodePath[i + 1]!)
    if (!segment) return null
    const centerline = segment.reversed ? [...segment.centerline].reverse() : segment.centerline
    for (let k = 1; k < centerline.length; k++) points.push(centerline[k]!)
  }
  return points
}

/** Snaps every route waypoint's Y to this cave's own retained heightfield
 *  floor — topology `y` is route-building intent, not the final rendered
 *  floor (plan fauna-019 §3). Falls back to the topology point's own `y`
 *  only where the heightfield genuinely carries no column there, which does
 *  not happen for a waypoint the route itself walked through. */
function snapRouteFloor(
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  points: readonly CaveTopologyPoint[],
): CaveTraversalPoint[] {
  return points.map((p) => {
    const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, p.x, p.z)
    return { x: p.x, y: column ? column.floorY : p.y, z: p.z }
  })
}

/**
 * Resolves the traversal descriptor for one cave: a standable interior home
 * chamber and the deterministic route from it to the entrance, both snapped
 * to `heightfield`'s own floor. `null` when no chamber candidate has enough
 * standing clearance for `entityHeight`, or when the topology graph has no
 * path from the chosen home to the entrance — callers must not fall back to
 * an "almost correct" point (plan fauna-019 §2).
 *
 * Pure and stateless: same inputs always resolve the same descriptor,
 * whether or not this cave's presentation is currently streamed.
 *
 * @domain world-terrain
 */
export function resolveCaveTraversal(
  topology: CaveTopology,
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  entityHeight: number,
): CaveTraversalDescriptor | null {
  const home = resolveHomeNode(topology, heightfield, surfaceHeightAt, entityHeight)
  if (!home) return null
  const nodePath = shortestNodePath(topology, home.node.id, 'entrance')
  if (!nodePath) return null
  const rawRoute = buildRoutePoints(topology, nodePath)
  if (!rawRoute || rawRoute.length === 0) return null
  const routeToEntrance = snapRouteFloor(heightfield, surfaceHeightAt, rawRoute)
  const entranceWaypoint = routeToEntrance[routeToEntrance.length - 1]!
  return {
    caveId: topology.caveId,
    entrance: { x: entranceWaypoint.x, y: entranceWaypoint.y, z: entranceWaypoint.z, yaw: topology.entrance.yaw },
    home: routeToEntrance[0]!,
    routeToEntrance,
  }
}
