/** Plan world-terrain-007 — deterministic `CaveDefinition` graphs, built on
 *  top of `largeCaves.ts`'s existing world-scale placement (`pickLargeCaveSites`).
 *  Placement (siting, slope/coast/mountain/road/settlement filtering) stays
 *  owned by `largeCaves.ts`; this module only expands each accepted site into
 *  a bounded entrance → tunnel → chamber(s) graph and rejects sites whose
 *  interior would break through the surface (overburden). Pure — no
 *  Three.js, no `ChunkManager`, deterministic from its inputs only. */

import {
  type CaveBounds,
  type CaveDefinition,
  type CaveEntrance,
  type CaveNode,
  type CaveTunnel,
  computeCaveBounds,
} from './caveVolume'
import {
  LARGE_CAVE_MOUTH_WIDTH,
  type LargeCavePlacementInput,
  type LargeCaveSite,
  pickLargeCaveSites,
  tunnelDirection,
} from './largeCaves'
import { createSeededRandom } from './parseSeed'

const MOUTH_RADIUS = LARGE_CAVE_MOUTH_WIDTH * 0.55
/** Depth of the deterministic mouth recess `createCaves.ts` carves into the
 *  surface heightmap (`chunkManager.modifyTerrain`). The interior starts at
 *  the *bottom* of that recess, never at the raw surface height: otherwise
 *  the whole graph sits `CAVE_MOUTH_DEPTH` too high, so the first metres of
 *  tunnel roof stand above the terrain (visible rock arch cutting through the
 *  meadow) and the cave's vertical envelope keeps overlapping the surface far
 *  past the mouth, capturing the ground query of an entity that is merely
 *  walking over the tunnel (contract §14). Shared with `createCaves.ts` so
 *  the carve and the geometry can't drift apart. */
export const CAVE_MOUTH_DEPTH = 2.4
const ENTRANCE_HEIGHT = 2.6
const TUNNEL_RADIUS = 1.7
const TUNNEL_CEILING_HEIGHT = 2.6
const CHAMBER_RADIUS_MIN = 4
const CHAMBER_RADIUS_VARIANCE = 1.6
const CHAMBER_HEIGHT = 4.2
const BRANCH_RADIUS_FACTOR = 0.82
const BRANCH_CEILING_HEIGHT = 2.4
const BRANCH_CHAMBER_HEIGHT = 3.6
const BRANCH_LENGTH_MIN = 5
const BRANCH_LENGTH_RANGE = 5
const BRANCH_ANGLE_MIN = (40 * Math.PI) / 180
const BRANCH_ANGLE_RANGE = (35 * Math.PI) / 180
const BRANCH_CHANCE = 0.55
const CONTINUATION_CHANCE = 0.45

/** Floor drops with cumulative path distance from the entrance — a single
 *  monotonic descent so deeper chambers are (by construction) further under
 *  the hill, keeping the overburden check simple and the shape legible. */
const DESCENT_PER_METER = 0.14
const MAX_DESCENT = 8

/** Minimum surface-to-ceiling clearance (metres) required to accept a
 *  candidate point; the entrance node itself is exempt (that's the opening). */
export const MIN_OVERBURDEN = 1.4
/** How many points along a tunnel span get overburden-checked. */
const OVERBURDEN_SAMPLES = 4
/** Fraction of a tunnel the strict `MIN_OVERBURDEN` check starts at — the
 *  leading section is the entrance opening's own shallow-roof continuation,
 *  held to `MOUTH_ROOF_MIN` instead (see below). */
const OVERBURDEN_MOUTH_SKIP = 0.35
/** Minimum roof thickness over that leading section. Far thinner than
 *  `MIN_OVERBURDEN` (this is the mouth's own shallow roof) but necessarily
 *  positive: the plan's surface contract (§7) allows a visible opening *only*
 *  at the mouth, so no interior geometry may stand above the terrain past it.
 *  The leading section used to be exempt entirely, which is what let the
 *  tunnel arch break through the meadow past the carved mouth. */
export const MOUTH_ROOF_MIN = 0.35
/** Where the leading-section check starts, measured from the tunnel's own
 *  start: just past the carved mouth footprint, which *is* the opening and so
 *  is legitimately roofless. */
export const MOUTH_FOOTPRINT_MARGIN = MOUTH_RADIUS + 0.35

export type CaveGeneratorInput = LargeCavePlacementInput

function rotateXZ(dx: number, dz: number, angle: number): { dx: number, dz: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { dx: dx * cos - dz * sin, dz: dx * sin + dz * cos }
}

function floorAtDistance(entranceFloorY: number, distance: number): number {
  return entranceFloorY - Math.min(distance, MAX_DESCENT / DESCENT_PER_METER) * DESCENT_PER_METER
}

/** Deterministic, index/order-independent id from the seed + the site's own
 *  (already-deterministic) placement — same seed → same id; rebuild/save
 *  reorder never changes it (contract §3). */
function makeCaveId(seed: number, site: LargeCaveSite): string {
  const fixedX = Math.round(site.x * 100)
  const fixedZ = Math.round(site.z * 100)
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ fixedX, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ fixedZ, 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return `cave:${h.toString(16).padStart(8, '0')}`
}

function overburdenOk(
  sampleHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  ceilingY: number,
): boolean {
  return sampleHeight(x, z) - ceilingY >= MIN_OVERBURDEN
}

function tunnelOverburdenOk(
  sampleHeight: (x: number, z: number) => number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  floorStartY: number,
  floorEndY: number,
  ceilingHeight: number,
): boolean {
  const roofAt = (t: number): number => {
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    const floorY = floorStartY + (floorEndY - floorStartY) * t
    return sampleHeight(x, z) - (floorY + ceilingHeight)
  }
  for (let i = 1; i <= OVERBURDEN_SAMPLES; i++) {
    const t = OVERBURDEN_MOUTH_SKIP + (i / OVERBURDEN_SAMPLES) * (1 - OVERBURDEN_MOUTH_SKIP)
    if (roofAt(t) < MIN_OVERBURDEN) return false
  }
  // Leading section: thin roof allowed, no roof isn't.
  const length = Math.hypot(bx - ax, bz - az)
  if (length > MOUTH_FOOTPRINT_MARGIN) {
    const tStart = MOUTH_FOOTPRINT_MARGIN / length
    for (let i = 0; i < OVERBURDEN_SAMPLES; i++) {
      const t = tStart + (i / OVERBURDEN_SAMPLES) * (OVERBURDEN_MOUTH_SKIP - tStart)
      if (t >= OVERBURDEN_MOUTH_SKIP) break
      if (roofAt(t) < MOUTH_ROOF_MIN) return false
    }
  }
  return true
}

/** Expands one accepted `LargeCaveSite` into a bounded cave graph, or `null`
 *  if the interior fails the overburden check even at its minimum (single
 *  chamber) extent. */
function buildCaveFromSite(
  seed: number,
  site: LargeCaveSite,
  sampleHeight: (x: number, z: number) => number,
): CaveDefinition | null {
  const random = createSeededRandom((seed ^ 0x51ed270b ^ Math.round(site.x * 97) ^ Math.round(site.z * 131)) >>> 0)
  const into = tunnelDirection(site.yaw)
  // Floor of the carved mouth recess, not the untouched surface — see
  // `CAVE_MOUTH_DEPTH`.
  const mouthFloorY = sampleHeight(site.x, site.z) - CAVE_MOUTH_DEPTH

  const entrance: CaveEntrance = {
    x: site.x,
    y: mouthFloorY,
    z: site.z,
    yaw: site.yaw,
    width: LARGE_CAVE_MOUTH_WIDTH,
    height: ENTRANCE_HEIGHT,
  }

  const mouthNode: CaveNode = {
    id: 'mouth',
    kind: 'mouth',
    center: { x: site.x, y: mouthFloorY, z: site.z },
    radius: MOUTH_RADIUS,
    floorY: mouthFloorY,
    ceilingY: mouthFloorY + ENTRANCE_HEIGHT,
  }

  const chamber1X = site.x + into.dx * site.length
  const chamber1Z = site.z + into.dz * site.length
  const chamber1FloorY = floorAtDistance(mouthFloorY, site.length)
  const chamber1: CaveNode = {
    id: 'chamber1',
    kind: 'chamber',
    center: { x: chamber1X, y: chamber1FloorY + CHAMBER_HEIGHT * 0.5, z: chamber1Z },
    radius: CHAMBER_RADIUS_MIN + random() * CHAMBER_RADIUS_VARIANCE,
    floorY: chamber1FloorY,
    ceilingY: chamber1FloorY + CHAMBER_HEIGHT,
  }

  const tunnel1: CaveTunnel = {
    id: 'tunnel1',
    from: 'mouth',
    to: 'chamber1',
    radius: TUNNEL_RADIUS,
    floorStartY: mouthFloorY,
    floorEndY: chamber1FloorY,
    ceilingHeight: TUNNEL_CEILING_HEIGHT,
  }

  if (!tunnelOverburdenOk(sampleHeight, site.x, site.z, chamber1X, chamber1Z, mouthFloorY, chamber1FloorY, TUNNEL_CEILING_HEIGHT)) {
    return null
  }
  if (!overburdenOk(sampleHeight, chamber1X, chamber1Z, chamber1.ceilingY)) return null

  const nodes: CaveNode[] = [mouthNode, chamber1]
  const tunnels: CaveTunnel[] = [tunnel1]

  const branchRoll = random()
  const wantsExtension = branchRoll < BRANCH_CHANCE + CONTINUATION_CHANCE
  if (wantsExtension) {
    const isBranch = branchRoll < BRANCH_CHANCE
    const angle = isBranch
      ? (random() < 0.5 ? -1 : 1) * (BRANCH_ANGLE_MIN + random() * BRANCH_ANGLE_RANGE)
      : 0
    const dir2 = rotateXZ(into.dx, into.dz, angle)
    const length2 = BRANCH_LENGTH_MIN + random() * BRANCH_LENGTH_RANGE
    const chamber2X = chamber1X + dir2.dx * length2
    const chamber2Z = chamber1Z + dir2.dz * length2
    const chamber2FloorY = floorAtDistance(mouthFloorY, site.length + length2)
    const chamber2: CaveNode = {
      id: 'chamber2',
      kind: 'chamber',
      center: { x: chamber2X, y: chamber2FloorY + BRANCH_CHAMBER_HEIGHT * 0.5, z: chamber2Z },
      radius: (CHAMBER_RADIUS_MIN + random() * CHAMBER_RADIUS_VARIANCE) * BRANCH_RADIUS_FACTOR,
      floorY: chamber2FloorY,
      ceilingY: chamber2FloorY + BRANCH_CHAMBER_HEIGHT,
    }
    const tunnel2: CaveTunnel = {
      id: 'tunnel2',
      from: 'chamber1',
      to: 'chamber2',
      radius: TUNNEL_RADIUS * BRANCH_RADIUS_FACTOR,
      floorStartY: chamber1FloorY,
      floorEndY: chamber2FloorY,
      ceilingHeight: BRANCH_CEILING_HEIGHT,
    }
    const extensionOk =
      tunnelOverburdenOk(sampleHeight, chamber1X, chamber1Z, chamber2X, chamber2Z, chamber1FloorY, chamber2FloorY, BRANCH_CEILING_HEIGHT)
      && overburdenOk(sampleHeight, chamber2X, chamber2Z, chamber2.ceilingY)
    if (extensionOk) {
      nodes.push(chamber2)
      tunnels.push(tunnel2)
    }
  }

  const bounds: CaveBounds = computeCaveBounds(entrance, nodes, tunnels)

  return {
    caveId: makeCaveId(seed, site),
    entrance,
    nodes,
    tunnels,
    bounds,
    variant: site.variant,
  }
}

/**
 * Deterministic world-scale cave definitions (plan world-terrain-007). Sites
 * come from `pickLargeCaveSites` (slope/coast/mountain/road/settlement
 * filtering, minimum separation); each accepted site is expanded into a
 * bounded entrance → tunnel → chamber(s) graph, dropped if its interior
 * would break the surface (overburden).
 */
export function generateCaveDefinitions(input: CaveGeneratorInput): CaveDefinition[] {
  const sites = pickLargeCaveSites(input)
  const out: CaveDefinition[] = []
  for (const site of sites) {
    const cave = buildCaveFromSite(input.seed, site, input.sampleHeight)
    if (cave) out.push(cave)
  }
  return out
}
