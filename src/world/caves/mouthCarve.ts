/** Plan world-terrain-008 — derived mouth geometry shared by terrain carve,
 *  the SDF spatial representation, and gameplay/presentation.
 *
 *  `CaveTopology.entrance` is the semantic doorway (anchor / yaw / width /
 *  height). Everything else — heightmap recess, aperture void, rock
 *  sides/lip/hood — is derived here so those systems cannot drift.
 *
 *  Depth falloff matches `applyModificationToTile` (`smoothstep` from centre
 *  to radius). Overlapping pits add, same as sequential digs.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import { CAVE_MOUTH_DEPTH } from '../caveGenerator'
import { openingDirection } from '../largeCaves'

export { CAVE_MOUTH_DEPTH }

export const CAVE_APPROACH_DEPTH = 1.35
/** Centre of the approach pit, along `openingDirection`, from the entrance. */
export const CAVE_APPROACH_OFFSET = 2.2
export const CAVE_MOUTH_RADIUS = 1.65
export const CAVE_APPROACH_RADIUS = 3.2

/** Signed distance along `openingDirection` from the entrance. Positive is
 *  outward (approach / hillside); negative is into the cave. SDF occupancy,
 *  occupancy-derived wall beads and the presentation aperture-cap clip all
 *  use this plane so the closed entrance ellipsoid does not own the approach. */
export const MOUTH_INTERIOR_ALONG = 0.05

/** Rock frame around the aperture — metres. */
export const MOUTH_FRAME_THICKNESS = 0.9
export const MOUTH_FRAME_OUTWARD = 1.35
export const MOUTH_FRAME_INWARD = 0.15
export const MOUTH_HOOD_HEIGHT = 0.35
export const MOUTH_LIP_DEPTH = 0.25
/** Aperture sleeve through the mouth-plane wall, long enough for Surface
 *  Nets (`cellSize` 0.4) to extract an opening. Kept shallow inward so
 *  interior floor continuity is unchanged. */
export const MOUTH_APERTURE_INWARD = 0.2
export const MOUTH_APERTURE_OUTWARD = 0.85

export type MouthCarveDisc = {
  x: number
  z: number
  radius: number
  depth: number
}

/**
 * Derived hillside doorway for one `CaveEntrance`. Terrain carve, SDF
 * aperture/frame, and presentation clip all read this instead of inventing
 * a second mouth.
 *
 * @domain world-terrain
 */
export type CaveMouthGeometry = {
  x: number
  y: number
  z: number
  yaw: number
  apertureWidth: number
  apertureHeight: number
  apertureHalfWidth: number
  floorY: number
  ceilingY: number
  mouthPitRadius: number
  approachRadius: number
  approachOffset: number
  approachDepth: number
  frameThickness: number
  frameOutward: number
  frameInward: number
  hoodHeight: number
  lipDepth: number
  apertureInward: number
  apertureOutward: number
  lintelY: number
}

/**
 * Builds the shared mouth geometry contract from topology/entrance intent.
 *
 * @domain world-terrain
 */
export function deriveMouthGeometry(
  entrance: Pick<CaveEntrance, 'x' | 'y' | 'z' | 'yaw' | 'width' | 'height'>,
): CaveMouthGeometry {
  const apertureWidth = entrance.width
  const apertureHeight = entrance.height
  const apertureHalfWidth = apertureWidth * 0.5
  return {
    x: entrance.x,
    y: entrance.y,
    z: entrance.z,
    yaw: entrance.yaw,
    apertureWidth,
    apertureHeight,
    apertureHalfWidth,
    floorY: entrance.y,
    ceilingY: entrance.y + apertureHeight,
    mouthPitRadius: CAVE_MOUTH_RADIUS,
    approachRadius: CAVE_APPROACH_RADIUS,
    approachOffset: CAVE_APPROACH_OFFSET,
    approachDepth: CAVE_APPROACH_DEPTH,
    frameThickness: MOUTH_FRAME_THICKNESS,
    frameOutward: MOUTH_FRAME_OUTWARD,
    frameInward: MOUTH_FRAME_INWARD,
    hoodHeight: MOUTH_HOOD_HEIGHT,
    lipDepth: MOUTH_LIP_DEPTH,
    apertureInward: MOUTH_APERTURE_INWARD,
    apertureOutward: MOUTH_APERTURE_OUTWARD,
    /** Top of the extracted opening — just below the analytic surface so
     *  the lintel/hood survives `clipTrianglesBelowSurface`. */
    lintelY: entrance.y + Math.min(apertureHeight, CAVE_MOUTH_DEPTH) - 0.08,
  }
}

/**
 * Signed distance along the mouth plane's outward axis. Greater than
 * `MOUTH_INTERIOR_ALONG` is the approach / hillside, not cave interior.
 *
 * @domain world-terrain
 */
export function mouthAlong(
  x: number,
  z: number,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>,
): number {
  const out = openingDirection(entrance.yaw)
  return (x - entrance.x) * out.dx + (z - entrance.z) * out.dz
}

/**
 * Signed distance in the mouth plane, perpendicular to `openingDirection`.
 * Magnitude is the lateral offset from the entrance centreline.
 *
 * @domain world-terrain
 */
export function mouthLateral(
  x: number,
  z: number,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'>,
): number {
  const out = openingDirection(entrance.yaw)
  return (x - entrance.x) * -out.dz + (z - entrance.z) * out.dx
}

/** Same Hermite smoothstep `THREE.MathUtils.smoothstep` uses, so the
 *  gameplay portal depth matches the heightmap dig without importing Three. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function pitDepth(x: number, z: number, cx: number, cz: number, radius: number, depth: number): number {
  const dist = Math.hypot(x - cx, z - cz)
  if (dist >= radius) return 0
  return depth * (1 - smoothstep(0, radius, dist))
}

/**
 * Radial pits `createCaves` feeds to `modifyTerrain`. Same discs
 * `mouthCarveDepth` sums, derived from `deriveMouthGeometry`.
 *
 * @domain world-terrain
 */
export function mouthCarveDiscs(
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'> & { width?: number },
): readonly MouthCarveDisc[] {
  const mouth = deriveMouthGeometry({
    x: entrance.x,
    y: 0,
    z: entrance.z,
    yaw: entrance.yaw,
    width: entrance.width ?? 3,
    height: 2.6,
  })
  const out = openingDirection(entrance.yaw)
  return [
    {
      x: entrance.x,
      z: entrance.z,
      radius: mouth.mouthPitRadius,
      depth: CAVE_MOUTH_DEPTH,
    },
    {
      x: entrance.x + out.dx * mouth.approachOffset,
      z: entrance.z + out.dz * mouth.approachOffset,
      radius: mouth.approachRadius,
      depth: mouth.approachDepth,
    },
  ]
}

/**
 * Combined mouth+approach carve depth at `(x, z)` — the amount
 * `createCaves` subtracts from the analytic surface. Zero outside both discs.
 *
 * @domain world-terrain
 */
export function mouthCarveDepth(
  x: number,
  z: number,
  entrance: Pick<CaveEntrance, 'x' | 'z' | 'yaw'> & { width?: number },
): number {
  let depth = 0
  for (const disc of mouthCarveDiscs(entrance)) {
    depth += pitDepth(x, z, disc.x, disc.z, disc.radius, disc.depth)
  }
  return depth
}

/**
 * True when `(along, lateral, y)` sits in the doorway opening itself —
 * the 3D aperture a presentation cap-clip may drop, not the hood/sides/lip.
 *
 * @domain world-terrain
 */
export function inMouthAperture(
  along: number,
  lateral: number,
  y: number,
  mouth: Pick<CaveMouthGeometry, 'apertureHalfWidth' | 'floorY' | 'lintelY'>,
  alongMin = MOUTH_INTERIOR_ALONG,
): boolean {
  if (along <= alongMin) return false
  const inset = 0.15
  if (Math.abs(lateral) > mouth.apertureHalfWidth - inset) return false
  return y >= mouth.floorY + inset && y <= mouth.lintelY - inset
}

/**
 * Axis-aligned box SDF in mouth-local `(along, y, lateral)` space.
 *
 * @domain world-terrain
 */
export function mouthLocalBoxSDF(
  along: number,
  y: number,
  lateral: number,
  along0: number,
  along1: number,
  y0: number,
  y1: number,
  latHalf: number,
): number {
  const cx = (along0 + along1) * 0.5
  const cy = (y0 + y1) * 0.5
  const hx = Math.abs(along1 - along0) * 0.5
  const hy = Math.abs(y1 - y0) * 0.5
  const qx = Math.abs(along - cx) - hx
  const qy = Math.abs(y - cy) - hy
  const qz = Math.abs(lateral) - latHalf
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  const oz = Math.max(qz, 0)
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz)
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  return outside + inside
}

/**
 * Void SDF of the doorway sleeve (negative inside the opening).
 *
 * @domain world-terrain
 */
export function mouthApertureVoidSDF(
  along: number,
  y: number,
  lateral: number,
  mouth: CaveMouthGeometry,
): number {
  return mouthLocalBoxSDF(
    along,
    y,
    lateral,
    -mouth.apertureInward,
    mouth.apertureOutward,
    mouth.floorY,
    mouth.lintelY,
    mouth.apertureHalfWidth,
  )
}

/**
 * Solid SDF of the natural rock frame (negative inside sides/hood/lip).
 *
 * @domain world-terrain
 */
export function mouthFrameSolidSDF(
  along: number,
  y: number,
  lateral: number,
  mouth: CaveMouthGeometry,
): number {
  const along0 = -mouth.frameInward
  const along1 = mouth.frameOutward
  const sideLat = mouth.apertureHalfWidth + mouth.frameThickness * 0.5
  const sideHalf = mouth.frameThickness * 0.5
  const left = mouthLocalBoxSDF(
    along, y, lateral - sideLat,
    along0, along1,
    mouth.floorY - mouth.lipDepth, mouth.lintelY + mouth.hoodHeight * 0.65,
    sideHalf,
  )
  const right = mouthLocalBoxSDF(
    along, y, lateral + sideLat,
    along0, along1,
    mouth.floorY - mouth.lipDepth, mouth.lintelY + mouth.hoodHeight * 0.65,
    sideHalf,
  )
  const hood = mouthLocalBoxSDF(
    along, y, lateral,
    along0, along1,
    mouth.lintelY - mouth.hoodHeight * 0.35, mouth.lintelY + mouth.hoodHeight * 0.65,
    mouth.apertureHalfWidth + mouth.frameThickness,
  )
  const lip = mouthLocalBoxSDF(
    along, y, lateral,
    0, mouth.frameOutward * 0.55,
    mouth.floorY - mouth.lipDepth, mouth.floorY,
    mouth.apertureHalfWidth + mouth.frameThickness * 0.45,
  )
  return Math.min(left, right, hood, lip)
}
