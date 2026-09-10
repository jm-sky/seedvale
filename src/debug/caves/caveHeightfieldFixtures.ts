/** Experimental cave heightfield spike — deterministic `CaveTopology` fixtures
 *  and a tiny local surface sampler. Not production cave siting.
 *
 * @domain world-terrain
 */

import type {
  CaveTopology,
  CaveTopologyNode,
  CaveTopologyPoint,
  CaveTopologySegment,
} from '../../world/caves/caveTopology'
import type { CaveEntrance } from '../../world/caveVolume'
import { mouthAlong, mouthLateral } from '../../world/caves/mouthCarve'

/** Shared doorway for every spike fixture — opening faces +Z, interior −Z. */
export const CAVE_HEIGHTFIELD_ENTRANCE: CaveEntrance = {
  x: 0,
  y: 2,
  z: 0,
  yaw: 0,
  width: 3,
  height: 2.6,
}

export const CAVE_HEIGHTFIELD_FIXTURE_IDS = ['basic', 'bend', 'branch'] as const
export type CaveHeightfieldFixtureId = (typeof CAVE_HEIGHTFIELD_FIXTURE_IDS)[number]

export const CAVE_HEIGHTFIELD_VARIANTS = ['heightfield', 'sdf'] as const
export type CaveHeightfieldVariant = (typeof CAVE_HEIGHTFIELD_VARIANTS)[number]

export const CAVE_HEIGHTFIELD_MODES = ['walk', 'inspect'] as const
export type CaveHeightfieldMode = (typeof CAVE_HEIGHTFIELD_MODES)[number]

/** Metres of rock above the deepest chamber ceiling in the local fixture. */
export const CAVE_HEIGHTFIELD_OVERBURDEN = 9

const CLIFF_OUT = 1.4
const CLIFF_IN = -0.7
const MOUTH_HALF = CAVE_HEIGHTFIELD_ENTRANCE.width * 0.55
const MOUTH_FLARE = 1.1

function lerpPoint(a: CaveTopologyPoint, b: CaveTopologyPoint, t: number): CaveTopologyPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

function arc(from: CaveTopologyPoint, to: CaveTopologyPoint, bulgeX: number, bulgeZ: number): CaveTopologyPoint[] {
  const mid = lerpPoint(from, to, 0.5)
  return [from, { x: mid.x + bulgeX, y: mid.y, z: mid.z + bulgeZ }, to]
}

function topology(
  fixture: CaveHeightfieldFixtureId,
  nodes: CaveTopologyNode[],
  segments: CaveTopologySegment[],
): CaveTopology {
  return {
    caveId: `heightfield-spike:${fixture}`,
    seed: 42,
    entrance: CAVE_HEIGHTFIELD_ENTRANCE,
    nodes,
    segments,
    features: [],
    minClearance: 2.1,
  }
}

/**
 * Hermite smoothstep cloned from `mouthCarve.ts` so the fixture cliff does
 * not import Three.js.
 *
 * @domain world-terrain
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Tiny deterministic hillside for the spike: flat approach, steep wall at
 * the doorway, overburden over the interior footprint. Prototype only —
 * production mouth carving stays in `mouthCarve.ts`.
 *
 * @domain world-terrain
 */
export function sampleCaveHeightfieldSurface(
  x: number,
  z: number,
  entrance: CaveEntrance = CAVE_HEIGHTFIELD_ENTRANCE,
): number {
  const along = mouthAlong(x, z, entrance)
  const lateral = mouthLateral(x, z, entrance)
  const approachY = entrance.y
  const ridgeY = entrance.y + CAVE_HEIGHTFIELD_OVERBURDEN
  let y: number
  if (along >= CLIFF_OUT) y = approachY
  else if (along <= CLIFF_IN) y = ridgeY
  else {
    const t = smoothstep(CLIFF_OUT, CLIFF_IN, along)
    y = approachY + (ridgeY - approachY) * t
  }
  const inDoorwayBand = along > -1.15 && along < 3.4 && Math.abs(lateral) < MOUTH_HALF + MOUTH_FLARE
  if (inDoorwayBand) {
    const lateralFade = 1 - smoothstep(MOUTH_HALF, MOUTH_HALF + MOUTH_FLARE, Math.abs(lateral))
    const alongFade = 1 - smoothstep(2.4, 3.4, along)
    const inwardFade = 1 - smoothstep(-1.15, -0.25, along)
    const cut = lateralFade * alongFade * inwardFade
    y = y + (approachY - y) * cut
  }
  return y
}

/**
 * Hand-authored `CaveTopology` fixtures for the heightfield spike. Width /
 * height / path come from topology; the heightfield builder must not replace
 * these with a second layout type.
 *
 * @domain world-terrain
 */
export function buildCaveHeightfieldFixture(id: CaveHeightfieldFixtureId): CaveTopology {
  const e = CAVE_HEIGHTFIELD_ENTRANCE
  const entrancePos: CaveTopologyPoint = { x: e.x, y: e.y, z: e.z }

  if (id === 'basic') {
    const passage: CaveTopologyPoint = { x: 0, y: 1.7, z: -8 }
    const chamber: CaveTopologyPoint = { x: 0, y: 1.15, z: -17 }
    const nodes: CaveTopologyNode[] = [
      { id: 'entrance', kind: 'entrance', position: entrancePos, targetWidth: e.width, targetHeight: e.height },
      { id: 'passage', kind: 'passage', position: passage, targetWidth: 2.6, targetHeight: 2.4 },
      { id: 'chamber', kind: 'chamber', position: chamber, targetWidth: 6.4, targetHeight: 4.1 },
    ]
    return topology(id, nodes, [
      { id: 'seg-entrance-passage', from: 'entrance', to: 'passage', centerline: [entrancePos, passage] },
      { id: 'seg-passage-chamber', from: 'passage', to: 'chamber', centerline: [passage, chamber] },
    ])
  }

  if (id === 'bend') {
    const passage: CaveTopologyPoint = { x: 0, y: 1.65, z: -7 }
    const widening: CaveTopologyPoint = { x: 5.2, y: 1.2, z: -13.5 }
    const chamber: CaveTopologyPoint = { x: 9.4, y: 0.85, z: -19 }
    const nodes: CaveTopologyNode[] = [
      { id: 'entrance', kind: 'entrance', position: entrancePos, targetWidth: e.width, targetHeight: e.height },
      { id: 'passage', kind: 'passage', position: passage, targetWidth: 2.5, targetHeight: 2.4 },
      { id: 'widening', kind: 'widening', position: widening, targetWidth: 4.3, targetHeight: 3.1 },
      { id: 'chamber', kind: 'chamber', position: chamber, targetWidth: 6.1, targetHeight: 4.2 },
    ]
    return topology(id, nodes, [
      { id: 'seg-entrance-passage', from: 'entrance', to: 'passage', centerline: [entrancePos, passage] },
      { id: 'seg-bend', from: 'passage', to: 'widening', centerline: arc(passage, widening, 1.8, 0.4) },
      { id: 'seg-widening-chamber', from: 'widening', to: 'chamber', centerline: [widening, chamber] },
    ])
  }

  const hub: CaveTopologyPoint = { x: 0, y: 1.55, z: -8 }
  const left: CaveTopologyPoint = { x: -6.4, y: 1.15, z: -14.2 }
  const right: CaveTopologyPoint = { x: 6.6, y: 1.05, z: -13.4 }
  const nodes: CaveTopologyNode[] = [
    { id: 'entrance', kind: 'entrance', position: entrancePos, targetWidth: e.width, targetHeight: e.height },
    { id: 'hub', kind: 'passage', position: hub, targetWidth: 3.4, targetHeight: 2.8 },
    { id: 'left-chamber', kind: 'chamber', position: left, targetWidth: 4.6, targetHeight: 3.3 },
    { id: 'right-chamber', kind: 'chamber', position: right, targetWidth: 4.9, targetHeight: 3.5 },
  ]
  return topology('branch', nodes, [
    { id: 'seg-entrance-hub', from: 'entrance', to: 'hub', centerline: [entrancePos, hub] },
    { id: 'seg-hub-left', from: 'hub', to: 'left-chamber', centerline: [hub, left] },
    { id: 'seg-hub-right', from: 'hub', to: 'right-chamber', centerline: [hub, right] },
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
