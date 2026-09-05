/** Plan world-terrain-007 — pure cave domain data + queries. `CaveDefinition`
 *  is a bounded graph of analytic primitives (nodes = chambers/entrance,
 *  tunnels = swept corridors between them), never Three.js/`ChunkManager`/
 *  save state. Mesh, collision and streaming are all derived from this. */

import { projectOntoSegment } from '../math/segment'

export type CaveNodeKind = 'mouth' | 'chamber'

export type CaveNode = {
  id: string
  kind: CaveNodeKind
  center: { x: number, y: number, z: number }
  /** Horizontal footprint radius. */
  radius: number
  floorY: number
  ceilingY: number
}

export type CaveTunnel = {
  id: string
  from: string
  to: string
  radius: number
  floorStartY: number
  floorEndY: number
  ceilingHeight: number
}

export type CaveEntrance = {
  x: number
  y: number
  z: number
  /** Same convention as `LargeCaveSite.yaw` (`largeCaves.ts`) — opening faces
   *  this yaw, downhill/outward. */
  yaw: number
  width: number
  height: number
}

export type CaveBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export type CaveDefinition = {
  caveId: string
  entrance: CaveEntrance
  nodes: readonly CaveNode[]
  tunnels: readonly CaveTunnel[]
  bounds: CaveBounds
  variant: number
}

function nodeById(definition: CaveDefinition, id: string): CaveNode {
  const node = definition.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`cave ${definition.caveId}: unknown node "${id}"`)
  return node
}

/** Horizontal containment + interpolated floor/ceiling for a tunnel segment
 *  at `(x, z)`, or `null` if outside the tunnel's radius/span. */
function tunnelSample(
  definition: CaveDefinition,
  tunnel: CaveTunnel,
  x: number,
  z: number,
): { floorY: number, ceilingY: number } | null {
  const from = nodeById(definition, tunnel.from)
  const to = nodeById(definition, tunnel.to)
  const { distSq, t } = projectOntoSegment(x, z, from.center.x, from.center.z, to.center.x, to.center.z)
  if (Math.sqrt(distSq) > tunnel.radius) return null
  const floorY = tunnel.floorStartY + (tunnel.floorEndY - tunnel.floorStartY) * t
  return { floorY, ceilingY: floorY + tunnel.ceilingHeight }
}

/** Horizontal containment + floor/ceiling for a chamber/mouth node at
 *  `(x, z)`, or `null` if outside its radius. */
function nodeSample(node: CaveNode, x: number, z: number): { floorY: number, ceilingY: number } | null {
  const dist = Math.hypot(x - node.center.x, z - node.center.z)
  if (dist > node.radius) return null
  return { floorY: node.floorY, ceilingY: node.ceilingY }
}

/** All primitives (nodes + tunnels) whose horizontal footprint contains
 *  `(x, z)`, each reduced to its local floor/ceiling. Junctions therefore
 *  naturally resolve by picking among several matches (contract §10/§18). */
function samplesAt(definition: CaveDefinition, x: number, z: number): Array<{ floorY: number, ceilingY: number }> {
  const out: Array<{ floorY: number, ceilingY: number }> = []
  for (const node of definition.nodes) {
    const sample = nodeSample(node, x, z)
    if (sample) out.push(sample)
  }
  for (const tunnel of definition.tunnels) {
    const sample = tunnelSample(definition, tunnel, x, z)
    if (sample) out.push(sample)
  }
  return out
}

/** How far *below* the reported floor an entity still counts as inside the
 *  cave.
 *
 *  `sampleFloor` collapses every primitive overlapping `(x, z)` to their
 *  **minimum** floor while `contains` used to require `y >= floorY` of one
 *  single primitive. Those two rules disagree wherever a flat-floored node
 *  disc — or a tunnel's flat end cap, `projectOntoSegment` clamping `t` —
 *  overlaps a sloping tunnel: the query itself puts the entity on the flat
 *  (lower) floor, and one step later, where only the sloping tunnel applies,
 *  that same Y is below the tunnel's local floor, so `contains` returned
 *  `false`, `PlayerController.groundAt()` fell back to `sampleHeight` and
 *  `integrateVerticalMotion`'s grounded branch teleported the player onto the
 *  meadow metres above.
 *
 *  Loosening the *lower* bound is safe: everything below a cave floor is
 *  inside solid rock — the surface sits at least `ceilingHeight` (>= 2.4 m)
 *  plus `MOUTH_ROOF_MIN` above the floor even in the thin-roofed mouth
 *  transition, and `MIN_OVERBURDEN` above the ceiling past it, so no surface
 *  entity is ever within this grace of a cave floor. The ceiling bound, which
 *  is what actually separates "in the cave" from "on the hillside above it",
 *  is unchanged. Measured worst floor step for the Milestone A spike proxy:
 *  1.36 m. */
const FLOOR_GRACE = 2

export type CaveVolume = {
  definition: CaveDefinition
  /** `true` iff `(x, z)` falls inside any primitive's horizontal footprint,
   *  ignoring the vertical envelope. Broad-phase only — never use this alone
   *  to decide "is this entity in the cave" (contract §14). */
  containsHorizontal: (x: number, z: number) => boolean
  /** Full containment, Y included — a surface entity directly above a tunnel
   *  does not count merely because its X/Z overlaps it. */
  contains: (x: number, y: number, z: number) => boolean
  /** Floor height at `(x, z)`, or `null` outside the cave. Never falls back
   *  to surface `sampleHeight` — the caller picks the fallback. */
  sampleFloor: (x: number, z: number) => number | null
  /** Ceiling height at `(x, z)`, or `null` outside the cave. */
  sampleCeiling: (x: number, z: number) => number | null
  /** Cheap signed clearance to the nearest wall/floor/ceiling: positive well
   *  inside, shrinking toward 0 near a boundary. Not exact for junctions —
   *  a broad-phase/debug query, not collision. */
  distanceToInteriorBoundary: (x: number, y: number, z: number) => number
  bounds: () => CaveBounds
}

export function createCaveVolume(definition: CaveDefinition): CaveVolume {
  return {
    definition,
    containsHorizontal(x, z) {
      return samplesAt(definition, x, z).length > 0
    },
    contains(x, y, z) {
      const samples = samplesAt(definition, x, z)
      if (samples.length === 0) return false
      // One vertical span per `(x, z)`, matching what `sampleFloor` /
      // `sampleCeiling` already report — never per-primitive, or an entity
      // standing on the collapsed (lowest) floor is rejected by the primitive
      // it just stepped into. See `FLOOR_GRACE`.
      let floorY = Infinity
      let ceilingY = -Infinity
      for (const sample of samples) {
        floorY = Math.min(floorY, sample.floorY)
        ceilingY = Math.max(ceilingY, sample.ceilingY)
      }
      return y >= floorY - FLOOR_GRACE && y <= ceilingY
    },
    sampleFloor(x, z) {
      const samples = samplesAt(definition, x, z)
      if (samples.length === 0) return null
      // Lowest connected floor wins at junctions (contract §10).
      return samples.reduce((lowest, s) => Math.min(lowest, s.floorY), Infinity)
    },
    sampleCeiling(x, z) {
      const samples = samplesAt(definition, x, z)
      if (samples.length === 0) return null
      let best = samples[0]!
      for (const s of samples) if (s.floorY < best.floorY) best = s
      return best.ceilingY
    },
    distanceToInteriorBoundary(x, y, z) {
      let best = -Infinity
      for (const node of definition.nodes) {
        const dist = Math.hypot(x - node.center.x, z - node.center.z)
        const horizontal = node.radius - dist
        const vertical = Math.min(y - node.floorY, node.ceilingY - y)
        best = Math.max(best, Math.min(horizontal, vertical))
      }
      for (const tunnel of definition.tunnels) {
        const from = nodeById(definition, tunnel.from)
        const to = nodeById(definition, tunnel.to)
        const { distSq, t } = projectOntoSegment(x, z, from.center.x, from.center.z, to.center.x, to.center.z)
        const horizontal = tunnel.radius - Math.sqrt(distSq)
        const floorY = tunnel.floorStartY + (tunnel.floorEndY - tunnel.floorStartY) * t
        const vertical = Math.min(y - floorY, floorY + tunnel.ceilingHeight - y)
        best = Math.max(best, Math.min(horizontal, vertical))
      }
      return best
    },
    bounds() {
      return definition.bounds
    },
  }
}

/** Bounds enclosing every node/tunnel primitive, with a small XZ margin so
 *  broad-phase streaming/candidate checks never clip the actual geometry. */
export function computeCaveBounds(
  entrance: CaveEntrance,
  nodes: readonly CaveNode[],
  tunnels: readonly CaveTunnel[],
): CaveBounds {
  let minX = entrance.x
  let maxX = entrance.x
  let minZ = entrance.z
  let maxZ = entrance.z
  let minY = entrance.y
  let maxY = entrance.y

  const expandPoint = (x: number, z: number, radius: number, loY: number, hiY: number): void => {
    minX = Math.min(minX, x - radius)
    maxX = Math.max(maxX, x + radius)
    minZ = Math.min(minZ, z - radius)
    maxZ = Math.max(maxZ, z + radius)
    minY = Math.min(minY, loY)
    maxY = Math.max(maxY, hiY)
  }

  for (const node of nodes) {
    expandPoint(node.center.x, node.center.z, node.radius, node.floorY, node.ceilingY)
  }
  for (const tunnel of tunnels) {
    const from = nodes.find((n) => n.id === tunnel.from)
    const to = nodes.find((n) => n.id === tunnel.to)
    if (!from || !to) continue
    expandPoint(from.center.x, from.center.z, tunnel.radius, tunnel.floorStartY, tunnel.floorStartY + tunnel.ceilingHeight)
    expandPoint(to.center.x, to.center.z, tunnel.radius, tunnel.floorEndY, tunnel.floorEndY + tunnel.ceilingHeight)
  }

  return { minX, maxX, minY, maxY, minZ, maxZ }
}
