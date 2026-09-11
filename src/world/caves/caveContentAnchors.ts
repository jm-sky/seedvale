/** Plan world-terrain-020 Stage B — deterministic semantic content anchors
 *  for `adventure` caves.
 *
 *  Topology still describes only shape/connectivity. Content *role* is a
 *  separate contract: the cave subsystem points at stable interior places
 *  (`sideTreasure`, `wagon`, …) without turning `CaveTopologyNodeKind` into
 *  a loot/dungeon vocabulary. Floor Y and clearance come from the cave's
 *  own retained `CaveHeightfieldRepresentation` — never from surface
 *  terrain, topology-node Y, or the player-stateful `Caves.queryGround()`.
 *
 *  Natural caves contribute an empty list. Anchors are world definitions
 *  and do not depend on presentation streaming.
 *
 * @domain world-terrain
 */

import type { CaveArchetype } from './caveArchetype'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import type { CaveTopology, CaveTopologyNode, CaveTopologySegment } from './caveTopology'
import { distanceToSegment } from '../../math/segment'
import {
  ADVENTURE_DEEP_CHAMBER_NODE_ID,
  ADVENTURE_DEEP_PASSAGE_NODE_ID,
  ADVENTURE_FINAL_CHAMBER_NODE_ID,
  ADVENTURE_FINAL_PASSAGE_NODE_ID,
  ADVENTURE_SIDE_CHAMBER_NODE_ID,
} from './adventureTopology'
import {
  chamberCandidates,
  footprintHolds,
  type Heading,
  incomingHeading,
  lateralDistance,
  type PassageWallBias,
  passageWallCandidates,
  signFromRandom,
  type Xz,
  yawFacing,
} from './caveHeightfieldPlacement'
import { sampleHeightfieldAt } from './caveHeightfieldRepresentation'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

export const CAVE_CONTENT_ANCHOR_ROLES = [
  'sideTreasure',
  'finalTreasure',
  'wagon',
  'support',
  'crate',
  'lantern',
] as const

export type CaveContentAnchorRole = (typeof CAVE_CONTENT_ANCHOR_ROLES)[number]

/**
 * Read-only placement descriptor for future cave content. Identity is
 * semantic (`caveId` + role + optional ordinal), never a runtime UUID and
 * never a topology-array index.
 *
 * @domain world-terrain
 */
export type CaveContentAnchor = {
  id: string
  caveId: string
  role: CaveContentAnchorRole
  x: number
  y: number
  z: number
  yaw: number
}

export type CaveContentAnchorInput = {
  archetype: CaveArchetype
  topology: CaveTopology
  /** The retained heightfield of *this* cave — do not sample a neighbour. */
  heightfield: CaveHeightfieldRepresentation
}

/** Gap / footprint / rim guards per role. Wagon is deliberately larger than
 *  a chest; lanterns may sit closer to a wall. Not a collider fit test. */
export type ContentAnchorPlacement = {
  minGap: number
  footprintRadius: number
  /** `coreT` is 0 in the walkable core and 1 at the rim. */
  maxCoreT: number
  keepOffThroughLine: boolean
  keepOffForeignPassages: boolean
}

export const CAVE_CONTENT_PLACEMENT: Record<CaveContentAnchorRole, ContentAnchorPlacement> = {
  sideTreasure: { minGap: 1.6, footprintRadius: 0.55, maxCoreT: 0.55, keepOffThroughLine: false, keepOffForeignPassages: true },
  finalTreasure: { minGap: 1.6, footprintRadius: 0.55, maxCoreT: 0.55, keepOffThroughLine: false, keepOffForeignPassages: true },
  wagon: { minGap: 2.4, footprintRadius: 1.15, maxCoreT: 0.42, keepOffThroughLine: true, keepOffForeignPassages: true },
  support: { minGap: 2.0, footprintRadius: 0.7, maxCoreT: 0.7, keepOffThroughLine: true, keepOffForeignPassages: true },
  crate: { minGap: 1.5, footprintRadius: 0.5, maxCoreT: 0.6, keepOffThroughLine: true, keepOffForeignPassages: true },
  lantern: { minGap: 1.4, footprintRadius: 0.3, maxCoreT: 0.78, keepOffThroughLine: true, keepOffForeignPassages: false },
}

/** Hard cap on XZ alternatives tried for one anchor. Fitting is bounded and
 *  deterministic — never an unbounded search and never runtime random. */
export const CONTENT_ANCHOR_CANDIDATE_LIMIT = 24

const EMPTY_ANCHORS: readonly CaveContentAnchor[] = Object.freeze([])

type FitContext = {
  heading: Heading
  throughOrigin: Xz
  homeNodeId: string
}

/**
 * Stable content-anchor identity. Repeating roles (`lantern`, `crate`,
 * `support`) take an ordinal; unique roles do not.
 *
 * @domain world-terrain
 */
export function caveContentAnchorId(
  caveId: string,
  role: CaveContentAnchorRole,
  ordinal?: number,
): string {
  return ordinal === undefined ? `${caveId}:${role}` : `${caveId}:${role}:${ordinal}`
}

function freezeAnchor(anchor: CaveContentAnchor): CaveContentAnchor {
  return Object.freeze(anchor)
}

/**
 * Bounded XZ alternatives around a semantic chamber/node. Thin wrapper over
 * the shared `chamberCandidates()` (`caveHeightfieldPlacement.ts`) fixing
 * the limit to `CONTENT_ANCHOR_CANDIDATE_LIMIT` — kept as its own exported
 * name/signature since existing tests call it directly.
 *
 * @domain world-terrain
 */
export function chamberContentCandidates(
  node: CaveTopologyNode,
  incoming: Heading,
  preferredSign: 1 | -1,
): Xz[] {
  return chamberCandidates(node, incoming, preferredSign, CONTENT_ANCHOR_CANDIDATE_LIMIT)
}

/**
 * Bounded wall-side alternatives along a passage centreline. Thin wrapper
 * over the shared `passageWallCandidates()`, same reasoning as
 * `chamberContentCandidates` above.
 *
 * @domain world-terrain
 */
export function passageWallContentCandidates(
  seg: CaveTopologySegment,
  t: number,
  preferredSign: 1 | -1,
  halfWidth: number,
  wallBias: PassageWallBias = 'default',
): { candidates: Xz[], along: Xz, heading: Heading } {
  return passageWallCandidates(seg, t, preferredSign, halfWidth, CONTENT_ANCHOR_CANDIDATE_LIMIT, wallBias)
}

function blocksForeignPassage(
  x: number,
  z: number,
  radius: number,
  topology: CaveTopology,
  homeNodeId: string,
): boolean {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  for (const seg of topology.segments) {
    if (seg.to === homeNodeId || seg.from === homeNodeId) continue
    if (seg.id.includes('side')) continue
    const from = nodeById.get(seg.from)
    const to = nodeById.get(seg.to)
    if (!from || !to) continue
    const half = Math.min(from.targetWidth, to.targetWidth) / 2
    const pts = seg.centerline
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      if (distanceToSegment(x, z, a.x, a.z, b.x, b.z) < half * 0.5 + radius) return true
    }
  }
  return false
}

function evaluateCandidate(
  field: CaveHeightfieldRepresentation,
  topology: CaveTopology,
  x: number,
  z: number,
  spec: ContentAnchorPlacement,
  ctx: FitContext,
): { ok: boolean, floorY: number, gap: number } {
  const sample = sampleHeightfieldAt(field, x, z)
  if (sample.outsideGrid || sample.openSky || sample.gap <= 0) {
    return { ok: false, floorY: sample.floorY, gap: sample.gap }
  }
  if (sample.gap < spec.minGap || sample.coreT > spec.maxCoreT) {
    return { ok: false, floorY: sample.floorY, gap: sample.gap }
  }
  if (!footprintHolds(field, x, z, spec.footprintRadius, spec.minGap)) {
    return { ok: false, floorY: sample.floorY, gap: sample.gap }
  }
  if (spec.keepOffThroughLine && lateralDistance(x, z, ctx.throughOrigin, ctx.heading) < spec.footprintRadius * 0.6) {
    return { ok: false, floorY: sample.floorY, gap: sample.gap }
  }
  if (spec.keepOffForeignPassages && blocksForeignPassage(x, z, spec.footprintRadius, topology, ctx.homeNodeId)) {
    return { ok: false, floorY: sample.floorY, gap: sample.gap }
  }
  return { ok: true, floorY: sample.floorY, gap: sample.gap }
}

function pickCandidate(
  field: CaveHeightfieldRepresentation,
  topology: CaveTopology,
  candidates: readonly Xz[],
  spec: ContentAnchorPlacement,
  ctx: FitContext,
  required: boolean,
): { x: number, y: number, z: number } | null {
  const limit = Math.min(candidates.length, CONTENT_ANCHOR_CANDIDATE_LIMIT)
  let fallback: { x: number, y: number, z: number } | null = null
  for (let i = 0; i < limit; i++) {
    const c = candidates[i]!
    const result = evaluateCandidate(field, topology, c.x, c.z, spec, ctx)
    if (result.ok) return { x: c.x, y: result.floorY, z: c.z }
    if (required && fallback === null) {
      const sample = sampleHeightfieldAt(field, c.x, c.z)
      if (!sample.outsideGrid && !sample.openSky && sample.gap > 0) {
        fallback = { x: c.x, y: sample.floorY, z: c.z }
      }
    }
  }
  return required ? fallback : null
}

function nodeOrNull(topology: CaveTopology, id: string): CaveTopologyNode | null {
  return topology.nodes.find((n) => n.id === id) ?? null
}

function segmentTo(topology: CaveTopology, nodeId: string): CaveTopologySegment | null {
  return topology.segments.find((s) => s.to === nodeId) ?? null
}

function placeAtNode(
  input: CaveContentAnchorInput,
  node: CaveTopologyNode,
  role: CaveContentAnchorRole,
  preferredSign: 1 | -1,
  required: boolean,
  ordinal?: number,
  yawOverride?: number,
): CaveContentAnchor | null {
  const heading = incomingHeading(input.topology, node.id)
  const placed = pickCandidate(
    input.heightfield,
    input.topology,
    chamberContentCandidates(node, heading, preferredSign),
    CAVE_CONTENT_PLACEMENT[role],
    { heading, throughOrigin: { x: node.position.x, z: node.position.z }, homeNodeId: node.id },
    required,
  )
  if (!placed) return null
  const yaw = yawOverride ?? yawFacing(-heading.dx, -heading.dz)
  return freezeAnchor({
    id: caveContentAnchorId(input.topology.caveId, role, ordinal),
    caveId: input.topology.caveId,
    role,
    x: placed.x,
    y: placed.y,
    z: placed.z,
    yaw,
  })
}

function placeAlongPassage(
  input: CaveContentAnchorInput,
  node: CaveTopologyNode,
  role: CaveContentAnchorRole,
  t: number,
  preferredSign: 1 | -1,
  ordinal: number,
): CaveContentAnchor | null {
  const seg = segmentTo(input.topology, node.id)
  if (!seg) return placeAtNode(input, node, role, preferredSign, false, ordinal)
  const from = nodeOrNull(input.topology, seg.from)
  const halfWidth = Math.min(node.targetWidth, from?.targetWidth ?? node.targetWidth) / 2
  const wallBias: PassageWallBias = role === 'lantern' ? 'tight' : 'default'
  const { candidates, along, heading } = passageWallContentCandidates(seg, t, preferredSign, halfWidth, wallBias)
  const placed = pickCandidate(
    input.heightfield,
    input.topology,
    candidates,
    CAVE_CONTENT_PLACEMENT[role],
    { heading, throughOrigin: along, homeNodeId: node.id },
    false,
  )
  if (!placed) return null
  const yaw = yawFacing(along.x - placed.x, along.z - placed.z)
  return freezeAnchor({
    id: caveContentAnchorId(input.topology.caveId, role, ordinal),
    caveId: input.topology.caveId,
    role,
    x: placed.x,
    y: placed.y,
    z: placed.z,
    yaw,
  })
}

function crateCandidatesAround(wagon: CaveContentAnchor, heading: Heading, preferredSign: 1 | -1): Xz[] {
  const perp = { dx: -heading.dz * preferredSign, dz: heading.dx * preferredSign }
  const behind = { dx: -heading.dx, dz: -heading.dz }
  return [
    { x: wagon.x + perp.dx * 1.4, z: wagon.z + perp.dz * 1.4 },
    { x: wagon.x - perp.dx * 1.4, z: wagon.z - perp.dz * 1.4 },
    { x: wagon.x + behind.dx * 1.6 + perp.dx * 0.8, z: wagon.z + behind.dz * 1.6 + perp.dz * 0.8 },
    { x: wagon.x + behind.dx * 1.6 - perp.dx * 0.8, z: wagon.z + behind.dz * 1.6 - perp.dz * 0.8 },
    { x: wagon.x + behind.dx * 2.1, z: wagon.z + behind.dz * 2.1 },
    { x: wagon.x + perp.dx * 1.9, z: wagon.z + perp.dz * 1.9 },
  ]
}

/**
 * Resolve the adventure content-anchor set against one cave's final
 * heightfield. Natural caves return an empty list. Callers must pass the
 * matching runtime field — overlapping cave bounds must not be resolved
 * through `Caves.sampleFloor`.
 *
 * @domain world-terrain
 */
export function resolveCaveContentAnchors(input: CaveContentAnchorInput): readonly CaveContentAnchor[] {
  if (input.archetype !== 'adventure') return EMPTY_ANCHORS

  const { topology, heightfield } = input
  const sideChamber = nodeOrNull(topology, ADVENTURE_SIDE_CHAMBER_NODE_ID)
  const finalChamber = nodeOrNull(topology, ADVENTURE_FINAL_CHAMBER_NODE_ID)
  const deepChamber = nodeOrNull(topology, ADVENTURE_DEEP_CHAMBER_NODE_ID)
  const deepPassage = nodeOrNull(topology, ADVENTURE_DEEP_PASSAGE_NODE_ID)
  const finalPassage = nodeOrNull(topology, ADVENTURE_FINAL_PASSAGE_NODE_ID)
  if (!sideChamber || !finalChamber || !deepChamber) return EMPTY_ANCHORS

  const random = createCaveRandom(topology.caveId, CAVE_RNG_SALT.adventureContent)
  // Draws happen in a fixed role order so omitted optional props cannot
  // shift later yaw/side choices.
  const sideSign = signFromRandom(random)
  const finalSign = signFromRandom(random)
  const wagonSign = signFromRandom(random)
  const support0Sign = signFromRandom(random)
  const support1Sign = signFromRandom(random)
  const crateSign = signFromRandom(random)
  const lantern0Sign = signFromRandom(random)
  const lantern1Sign = signFromRandom(random)

  const anchors: CaveContentAnchor[] = []
  const push = (anchor: CaveContentAnchor | null): void => {
    if (anchor) anchors.push(anchor)
  }

  push(placeAtNode(input, sideChamber, 'sideTreasure', sideSign, true))
  push(placeAtNode(input, finalChamber, 'finalTreasure', finalSign, true))

  const wagonHeading = incomingHeading(topology, deepChamber.id)
  const wagon = placeAtNode(
    input,
    deepChamber,
    'wagon',
    wagonSign,
    true,
    undefined,
    yawFacing(wagonHeading.dx, wagonHeading.dz),
  )
  push(wagon)

  push(placeAtNode(input, deepChamber, 'support', support0Sign, false, 0))
  if (finalPassage) {
    push(placeAlongPassage(input, finalPassage, 'support', 0.4, support1Sign, 1))
  } else {
    push(placeAtNode(input, finalChamber, 'support', support1Sign, false, 1))
  }

  if (wagon) {
    const crateCtx: FitContext = {
      heading: wagonHeading,
      throughOrigin: { x: deepChamber.position.x, z: deepChamber.position.z },
      homeNodeId: deepChamber.id,
    }
    let ordinal = 0
    for (const spot of crateCandidatesAround(wagon, wagonHeading, crateSign)) {
      if (ordinal >= 2) break
      if (anchors.some((a) => Math.hypot(a.x - spot.x, a.z - spot.z) < 0.9)) continue
      const placed = pickCandidate(heightfield, topology, [spot], CAVE_CONTENT_PLACEMENT.crate, crateCtx, false)
      if (!placed) continue
      anchors.push(freezeAnchor({
        id: caveContentAnchorId(topology.caveId, 'crate', ordinal),
        caveId: topology.caveId,
        role: 'crate',
        x: placed.x,
        y: placed.y,
        z: placed.z,
        yaw: yawFacing(-wagonHeading.dx, -wagonHeading.dz),
      }))
      ordinal++
    }
  }

  if (deepPassage) push(placeAlongPassage(input, deepPassage, 'lantern', 0.55, lantern0Sign, 0))
  if (finalPassage) push(placeAlongPassage(input, finalPassage, 'lantern', 0.45, lantern1Sign, 1))

  return Object.freeze(anchors)
}
