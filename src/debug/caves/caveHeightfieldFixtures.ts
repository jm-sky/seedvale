/** Experimental cave heightfield spike — deterministic `CaveTopology`
 *  fixtures anchored to the production analytic terrain sampler
 *  (`caveHeightfieldTerrain.ts`). Not production cave siting.
 *
 * @domain world-terrain
 */

import type {
  CaveTopology,
  CaveTopologyFeature,
  CaveTopologyNode,
  CaveTopologyPoint,
  CaveTopologySegment,
} from '../../world/caves/caveTopology'
import type { CaveEntrance } from '../../world/caveVolume'
import { CAVE_MOUTH_DEPTH } from '../../world/caves/mouthCarve'
import { mouthOverburdenRequirement } from '../../world/caves/mouthOverburden'
import { minSurfaceOverFootprint } from '../../world/caves/terrainFootprint'
import { PROXY_MARGIN } from '../../world/caves/topologyAdapter'
import {
  sampleCaveHeightfieldBaseSurface,
  sampleCaveHeightfieldWalkSurface,
} from './caveHeightfieldTerrain'

/** Mirrors `productionTopology.ts`'s private `STATION_SAFETY` — extra slack
 *  under the required overburden so a station never sits exactly on it. */
const STATION_SAFETY = 0.35

// ── Representative fixture geometry ─────────────────────────────────────────
//
// Everything in this block is **topology** intent — usable width, usable
// height, station placement and descent. Passage/chamber *length* is not a
// parameter: it follows from the station positions through the centerline,
// which is where `CaveTopology` already expresses it.
//
// Representation parameters (grid cell size, rim profile, noise) deliberately
// do NOT live here — they belong to `DEFAULT_HEIGHTFIELD_CONFIG` and the
// cross-section constants in `src/world/caves/caveHeightfieldRepresentation.ts`.

const ENTRANCE_WIDTH = 3
const ENTRANCE_HEIGHT = 2.6
const ENTRANCE_YAW = 0

/** Straight reference cave: entrance → passage → main chamber. */
const BASIC = {
  passage: { x: 0, z: -8, width: 2.6, height: 2.4, descent: 1 },
  /** The main chamber. Deliberately much larger than the passage so the
   *  arrival reads as a room rather than a wide spot: ~4x the passage width
   *  and ~2.4x its headroom. Both are plain `CaveTopology` dimensions — the
   *  lobe layout in `buildChamberLobes()` scales off `targetWidth`, so this
   *  needs no second chamber parameter. */
  chamber: { x: 0, z: -19.5, width: 11, height: 5.8, descent: 3.2 },
  /** Ledge beside the lower chamber floor: offset from the chamber node, and
   *  how far its top sits above that floor. */
  shelf: { offsetX: -3.4, offsetZ: -1.6, topAboveFloor: 1.1 },
} as const

/** Curved cave: entrance → passage → widening → chamber. */
const BEND = {
  passage: { x: 0, z: -7, width: 2.5, height: 2.4, descent: 0.9 },
  widening: { x: 5.2, z: -13.5, width: 4.3, height: 3.1, descent: 1.7 },
  chamber: { x: 10.2, z: -20, width: 9, height: 5.2, descent: 3 },
  bulge: { x: 1.8, z: 0.4 },
  overhang: { offsetX: -2.4, offsetZ: 1 },
} as const

/** Junction cave: entrance → hub → two chambers. */
const BRANCH = {
  hub: { x: 0, z: -8, width: 3.4, height: 2.8, descent: 1.1 },
  left: { x: -7.2, z: -15, width: 6.4, height: 4.2, descent: 2.6 },
  right: { x: 7.4, z: -14.2, width: 6.8, height: 4.4, descent: 2.7 },
} as const

/**
 * Shared doorway for every spike fixture — opening faces +Z, interior −Z.
 * `y` is the mouth *floor*, derived exactly as `productionTopology.ts` does
 * it: local surface minus `CAVE_MOUTH_DEPTH`, i.e. the bottom of the recess
 * `createCaves()` carves.
 */
export const CAVE_HEIGHTFIELD_ENTRANCE: CaveEntrance = {
  x: 0,
  y: sampleCaveHeightfieldBaseSurface(0, 0) - CAVE_MOUTH_DEPTH,
  z: 0,
  yaw: ENTRANCE_YAW,
  width: ENTRANCE_WIDTH,
  height: ENTRANCE_HEIGHT,
}

export const CAVE_HEIGHTFIELD_FIXTURE_IDS = ['basic', 'bend', 'branch'] as const
export type CaveHeightfieldFixtureId = (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number]

export const CAVE_HEIGHTFIELD_VARIANTS = ['heightfield', 'sdf'] as const
export type CaveHeightfieldVariant = (typeof CAVE_HEIGHTFIELD_VARIANTS)[number]

export const CAVE_HEIGHTFIELD_MODES = ['walk', 'inspect'] as const
export type CaveHeightfieldMode = (typeof CAVE_HEIGHTFIELD_MODES)[number]

/**
 * Analytic surface both spike representations are built against — the same
 * function for heightfield and SDF, so the comparison never differs by
 * terrain input. Equivalent to `createCaves()`'s `analyticSurfaceHeight`.
 *
 * @domain world-terrain
 */
export function caveHeightfieldBaseSurfaceAt(x: number, z: number): number {
  return sampleCaveHeightfieldBaseSurface(x, z)
}

/**
 * Walkable/rendered surface: analytic base minus the production mouth
 * recess. Outdoor player ground and the harness terrain mesh use this.
 *
 * @domain world-terrain
 */
export function caveHeightfieldWalkSurfaceAt(x: number, z: number): number {
  return sampleCaveHeightfieldWalkSurface(x, z, CAVE_HEIGHTFIELD_ENTRANCE)
}

/**
 * Deepest floor Y that still leaves the production-required overburden over
 * a station of this width/height, reusing `minSurfaceOverFootprint` +
 * `mouthOverburdenRequirement` — the same two rules `productionTopology.ts`
 * applies. Only ever pushes a station *down*, never up.
 *
 * @domain world-terrain
 */
function anchoredFloorY(
  desiredY: number,
  x: number,
  z: number,
  width: number,
  height: number,
): number {
  const distanceFromMouth = Math.hypot(x - CAVE_HEIGHTFIELD_ENTRANCE.x, z - CAVE_HEIGHTFIELD_ENTRANCE.z)
  const required = mouthOverburdenRequirement(CAVE_HEIGHTFIELD_ENTRANCE, distanceFromMouth, PROXY_MARGIN)
  if (required === null) return desiredY
  const radius = width / 2 + PROXY_MARGIN
  const allowedCeiling = minSurfaceOverFootprint(sampleCaveHeightfieldBaseSurface, x, z, radius)
    - required
    - STATION_SAFETY
  return Math.min(desiredY, allowedCeiling - height)
}

/** Authored station: XZ plus metres of descent below the mouth floor. */
type FixtureStation = {
  id: string
  kind: CaveTopologyNode['kind']
  x: number
  z: number
  /** Metres below `CAVE_HEIGHTFIELD_ENTRANCE.y`, before the overburden clamp. */
  descent: number
  targetWidth: number
  targetHeight: number
}

function stationNode(station: FixtureStation): CaveTopologyNode {
  const desiredY = CAVE_HEIGHTFIELD_ENTRANCE.y - station.descent
  return {
    id: station.id,
    kind: station.kind,
    position: {
      x: station.x,
      y: anchoredFloorY(desiredY, station.x, station.z, station.targetWidth, station.targetHeight),
      z: station.z,
    },
    targetWidth: station.targetWidth,
    targetHeight: station.targetHeight,
  }
}

/**
 * Straight run between two anchored nodes, re-clamping every interior point
 * so a centerline crossing a dip in the hillside does not break the surface.
 */
function runCenterline(from: CaveTopologyNode, to: CaveTopologyNode, steps = 4): CaveTopologyPoint[] {
  const points: CaveTopologyPoint[] = [from.position]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = from.position.x + (to.position.x - from.position.x) * t
    const z = from.position.z + (to.position.z - from.position.z) * t
    const width = from.targetWidth + (to.targetWidth - from.targetWidth) * t
    const height = from.targetHeight + (to.targetHeight - from.targetHeight) * t
    const desiredY = from.position.y + (to.position.y - from.position.y) * t
    points.push({ x, y: anchoredFloorY(desiredY, x, z, width, height), z })
  }
  points.push(to.position)
  return points
}

/** Same as `runCenterline` but bulged sideways so the passage actually bends. */
function bendCenterline(
  from: CaveTopologyNode,
  to: CaveTopologyNode,
  bulgeX: number,
  bulgeZ: number,
  steps = 6,
): CaveTopologyPoint[] {
  const points: CaveTopologyPoint[] = [from.position]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const bulge = Math.sin(t * Math.PI)
    const x = from.position.x + (to.position.x - from.position.x) * t + bulgeX * bulge
    const z = from.position.z + (to.position.z - from.position.z) * t + bulgeZ * bulge
    const width = from.targetWidth + (to.targetWidth - from.targetWidth) * t
    const height = from.targetHeight + (to.targetHeight - from.targetHeight) * t
    const desiredY = from.position.y + (to.position.y - from.position.y) * t
    points.push({ x, y: anchoredFloorY(desiredY, x, z, width, height), z })
  }
  points.push(to.position)
  return points
}

function topology(
  fixture: CaveHeightfieldFixtureId,
  nodes: CaveTopologyNode[],
  segments: CaveTopologySegment[],
  features: CaveTopologyFeature[] = [],
): CaveTopology {
  return {
    caveId: `heightfield-spike:${fixture}`,
    seed: 42,
    entrance: CAVE_HEIGHTFIELD_ENTRANCE,
    nodes,
    segments,
    features,
    minClearance: 2.1,
  }
}

/**
 * `shelf` fixture feature — an **elevated floor region / ledge** beside the
 * lower chamber floor (`docs/plans/world-terrain-008` feature semantics), not
 * a floating slab. Authored the way `CaveTopologyFeature` expresses it: a box
 * whose *top face* is the ledge surface, so the heightfield raises `floorY`
 * to `position.y + size.height / 2` over the footprint.
 *
 * @domain world-terrain
 */
function shelfFeature(
  anchor: CaveTopologyNode,
  offsetX: number,
  offsetZ: number,
  topAboveFloor: number,
): CaveTopologyFeature {
  const height = 0.6
  return {
    id: 'chamber-shelf',
    kind: 'shelf',
    anchorNodeId: anchor.id,
    position: {
      x: anchor.position.x + offsetX,
      y: anchor.position.y + topAboveFloor - height / 2,
      z: anchor.position.z + offsetZ,
    },
    size: { width: 3.2, height, depth: 2.4 },
  }
}

/**
 * `overhang` fixture feature — a genuine 3D ceiling/wall element. In 2.5D the
 * spike can only express it as a local `ceilingY` depression (a rock pendant
 * read from below); it is deliberately **not** reproduced as a volumetric
 * undercut. See the design doc's 2.5D limitations.
 *
 * @domain world-terrain
 */
function overhangFeature(
  anchor: CaveTopologyNode,
  offsetX: number,
  offsetZ: number,
): CaveTopologyFeature {
  return {
    id: 'chamber-overhang',
    kind: 'overhang',
    anchorNodeId: anchor.id,
    position: {
      x: anchor.position.x + offsetX,
      y: anchor.position.y + anchor.targetHeight * 0.68,
      z: anchor.position.z + offsetZ,
    },
    size: { width: 3, height: 1.1, depth: 2.2 },
  }
}

/** Turns one entry of the geometry blocks above into an anchored node. */
function station(
  id: string,
  kind: CaveTopologyNode['kind'],
  geo: { x: number, z: number, width: number, height: number, descent: number },
): CaveTopologyNode {
  return stationNode({
    id,
    kind,
    x: geo.x,
    z: geo.z,
    descent: geo.descent,
    targetWidth: geo.width,
    targetHeight: geo.height,
  })
}

const ENTRANCE_STATION: FixtureStation = {
  id: 'entrance',
  kind: 'entrance',
  x: CAVE_HEIGHTFIELD_ENTRANCE.x,
  z: CAVE_HEIGHTFIELD_ENTRANCE.z,
  descent: 0,
  targetWidth: ENTRANCE_WIDTH,
  targetHeight: ENTRANCE_HEIGHT,
}

/**
 * Hand-authored `CaveTopology` fixtures for the heightfield spike. Width /
 * height / path come from topology; floor Y follows the real local terrain
 * through `anchoredFloorY`. The heightfield builder must not replace these
 * with a second layout type.
 *
 * @domain world-terrain
 */
export function buildCaveHeightfieldFixture(id: CaveHeightfieldFixtureId): CaveTopology {
  if (id === 'basic') {
    const entrance = stationNode(ENTRANCE_STATION)
    const passage = station('passage', 'passage', BASIC.passage)
    const chamber = station('chamber', 'chamber', BASIC.chamber)
    return topology(id, [entrance, passage, chamber], [
      { id: 'seg-entrance-passage', from: 'entrance', to: 'passage', centerline: runCenterline(entrance, passage) },
      { id: 'seg-passage-chamber', from: 'passage', to: 'chamber', centerline: runCenterline(passage, chamber) },
    ], [shelfFeature(chamber, BASIC.shelf.offsetX, BASIC.shelf.offsetZ, BASIC.shelf.topAboveFloor)])
  }

  if (id === 'bend') {
    const entrance = stationNode(ENTRANCE_STATION)
    const passage = station('passage', 'passage', BEND.passage)
    const widening = station('widening', 'widening', BEND.widening)
    const chamber = station('chamber', 'chamber', BEND.chamber)
    return topology(id, [entrance, passage, widening, chamber], [
      { id: 'seg-entrance-passage', from: 'entrance', to: 'passage', centerline: runCenterline(entrance, passage) },
      { id: 'seg-bend', from: 'passage', to: 'widening', centerline: bendCenterline(passage, widening, BEND.bulge.x, BEND.bulge.z) },
      { id: 'seg-widening-chamber', from: 'widening', to: 'chamber', centerline: runCenterline(widening, chamber) },
    ], [overhangFeature(chamber, BEND.overhang.offsetX, BEND.overhang.offsetZ)])
  }

  const entrance = stationNode(ENTRANCE_STATION)
  const hub = station('hub', 'passage', BRANCH.hub)
  const left = station('left-chamber', 'chamber', BRANCH.left)
  const right = station('right-chamber', 'chamber', BRANCH.right)
  return topology('branch', [entrance, hub, left, right], [
    { id: 'seg-entrance-hub', from: 'entrance', to: 'hub', centerline: runCenterline(entrance, hub) },
    { id: 'seg-hub-left', from: 'hub', to: 'left-chamber', centerline: runCenterline(hub, left) },
    { id: 'seg-hub-right', from: 'hub', to: 'right-chamber', centerline: runCenterline(hub, right) },
  ])
}

export function parseCaveHeightfieldFixtureId(raw: string | null): CaveHeightfieldFixtureId {
  if (raw && (CAVE_HEIGHTFIELD_FIXTURE_IDS as readonly string[]).includes(raw)) {
    return raw as CaveHeightfieldFixtureId
  }
  return 'basic'
}

export function parseCaveHeightfieldVariant(raw: string | null): CaveHeightfieldVariant {
  if (raw && (CAVE_HEIGHTFIELD_VARIANTS as readonly string[]).includes(raw)) {
    return raw as CaveHeightfieldVariant
  }
  return 'heightfield'
}

export function parseCaveHeightfieldMode(raw: string | null): CaveHeightfieldMode {
  if (raw && (CAVE_HEIGHTFIELD_MODES as readonly string[]).includes(raw)) {
    return raw as CaveHeightfieldMode
  }
  return 'walk'
}
