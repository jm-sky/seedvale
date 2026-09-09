import type { CircleCollider, Collider } from '../world/collision'

/** Keep the third-person boom this far above `sampleHeight` (metres). */
export const CAMERA_GROUND_CLEARANCE = 0.45
/**
 * Colliders smaller than this are ignored (tree trunks 0.4, most rocks ≤ 0.9).
 * Houses / wells are ≥ ~1.5 / 1.0 — those are the volumes that fill the
 * frame with interior backfaces when the boom tunnels through them.
 */
export const CAMERA_OCCLUDER_MIN_RADIUS = 1.2
/** Cylinder height above terrain at the collider centre. MegaKit cottages
 *  sit under this; flying the boom *over* a roof is allowed. */
export const CAMERA_OCCLUDER_HEIGHT = 8
/** Never sit closer than this (metres) to the look-at — keeps the near
 *  plane out of the chest, but stays small enough that a steep look-up
 *  can still rest above the ground instead of being forced underground. */
export const CAMERA_BOOM_MIN_DISTANCE = 0.35
/** Pull this many metres back from the first hit so the near plane (0.1)
 *  isn't sitting inside the surface. */
export const CAMERA_BOOM_PULL_IN = 0.2
/** Skip terrain tests this close to the look-at — swimming can put the
 *  look-at below the flattened water mesh, which is not a camera clip. */
export const CAMERA_TERRAIN_SKIP_DISTANCE = 1.5
const TERRAIN_STEPS = 20
const DEGENERATE = 1e-8
/** Sit this far below an occupancy ceiling so the near plane is not in rock. */
const CAMERA_CEILING_CLEARANCE = 0.05
/** Occupancy whose ceiling is this close to the heightfield is the surface
 *  clip / mouth hood — not a place for an interior follow camera to park.
 *  Same slack as the portal look-out heuristic in `marchCaveOccupancy`. */
const INTERIOR_SURFACE_CLIP = 0.3

type OccupancySample = { floorY: number, ceilingY: number, openSky?: boolean }

export type CameraBoomInput = {
  originX: number
  originY: number
  originZ: number
  camX: number
  camY: number
  camZ: number
  sampleHeight: (x: number, z: number) => number
  colliders: readonly Collider[]
  /** Strict cave occupancy at the sample point (true void). When the boom
   *  origin is in cave void, the march pulls in at the first underground
   *  non-void sample (wall / ceiling / overburden) instead of relying on
   *  cave collider beads passing `CAMERA_OCCLUDER_MIN_RADIUS`. */
  occupancyAt?: (x: number, y: number, z: number) => OccupancySample | null
}

export type CameraBoomResult = {
  x: number
  y: number
  z: number
  /** 1 = unconstrained desired camera; < 1 = pulled in along the boom. */
  t: number
}

/**
 * Pulls the third-person camera along the look-at → desired-camera boom so
 * it stays out of the heightfield, out of large XZ colliders (houses), and
 * — when `occupancyAt` is provided and the origin is in cave void — out of
 * cave walls, ceiling and overburden. Stable interior follow void never
 * falls back to the outdoor heightfield; the boom shortens to the last
 * follow-void sample instead of parking in the surface-clipped mouth hood.
 * Cave beads stay below `CAMERA_OCCLUDER_MIN_RADIUS` on purpose; occupancy
 * is the cave occluder.
 */
export function resolveCameraBoom(input: CameraBoomInput): CameraBoomResult {
  const dx = input.camX - input.originX
  const dy = input.camY - input.originY
  const dz = input.camZ - input.originZ
  const dist = Math.hypot(dx, dy, dz)
  if (dist < DEGENERATE) {
    return { x: input.camX, y: input.camY, z: input.camZ, t: 1 }
  }

  let hitT = 1
  const originOccupancy = input.occupancyAt?.(input.originX, input.originY, input.originZ) ?? null
  const originInCave = originOccupancy !== null
  const originFollowVoid = isInteriorFollowVoid(
    originOccupancy,
    input.sampleHeight(input.originX, input.originZ),
  )

  if (originInCave) {
    const occupancyMarch = marchCaveOccupancy(input, dx, dy, dz, originOccupancy, originFollowVoid)
    if (occupancyMarch.kind === 'solid' && occupancyMarch.t < hitT) hitT = occupancyMarch.t
    else if (occupancyMarch.kind === 'exit') {
      const terrainHit = firstTerrainHitFromT(input, dx, dy, dz, occupancyMarch.t)
      if (terrainHit !== null && terrainHit < hitT) hitT = terrainHit
    }
  } else {
    const terrainHit = firstTerrainHitT(input, dx, dy, dz, dist)
    if (terrainHit !== null && terrainHit < hitT) hitT = terrainHit
  }

  for (const collider of input.colliders) {
    // House walls/doors are thin OBBs (plan settlements-001) — camera
    // occlusion stays circle-only, matching their previous sub-threshold
    // 0.95 m circle radius (never occluded the boom either).
    if (collider.type !== 'circle') continue
    if (collider.radius < CAMERA_OCCLUDER_MIN_RADIUS) continue
    const roofY = input.sampleHeight(collider.x, collider.z) + CAMERA_OCCLUDER_HEIGHT
    const colliderHit = firstCylinderHitT(
      input.originX,
      input.originY,
      input.originZ,
      dx,
      dy,
      dz,
      collider,
      roofY,
    )
    if (colliderHit !== null && colliderHit < hitT) hitT = colliderHit
  }

  const pullT = CAMERA_BOOM_PULL_IN / dist
  const minT = Math.min(CAMERA_BOOM_MIN_DISTANCE / dist, 0.5)
  let t = hitT >= 1 ? 1 : clamp(hitT - pullT, minT, 1)

  if (originFollowVoid) {
    t = lastInteriorVoidT(input, dx, dy, dz, t, minT)
  }

  const x = input.originX + dx * t
  const z = input.originZ + dz * t
  const yAlong = input.originY + dy * t
  const occupancy = originInCave ? input.occupancyAt?.(x, yAlong, z) ?? null : null
  const y = resolveBoomY(input, originFollowVoid, originOccupancy, occupancy, x, yAlong, z)
  return { x, y, z, t }
}

/**
 * Interior follow void: strict occupancy that is not the open-sky portal and
 * not a heightfield-clipped hood. Portal origin keeps using raw occupancy so
 * a real mouth look-out still leaves the cave.
 */
function isInteriorFollowVoid(
  occ: OccupancySample | null,
  groundY: number,
): boolean {
  if (!occ || occ.openSky) return false
  if (occ.ceilingY >= groundY - INTERIOR_SURFACE_CLIP) return false
  return true
}

function lastInteriorVoidT(
  input: CameraBoomInput,
  dx: number,
  dy: number,
  dz: number,
  startT: number,
  minT: number,
): number {
  const occupancyAt = input.occupancyAt
  if (!occupancyAt) return startT
  let t = startT
  for (let guard = 0; guard <= TERRAIN_STEPS; guard++) {
    const x = input.originX + dx * t
    const y = input.originY + dy * t
    const z = input.originZ + dz * t
    const occ = occupancyAt(x, y, z)
    const groundY = input.sampleHeight(x, z)
    if (isInteriorFollowVoid(occ, groundY)) return t
    if (t <= minT + 1e-9) return minT
    t = Math.max(minT, t - 1 / TERRAIN_STEPS)
  }
  return minT
}

function clampToOccupancy(yAlong: number, occ: OccupancySample): number {
  const lo = occ.floorY + CAMERA_GROUND_CLEARANCE
  const hi = occ.ceilingY - CAMERA_CEILING_CLEARANCE
  if (hi < lo) return (occ.floorY + occ.ceilingY) * 0.5
  return clamp(yAlong, lo, hi)
}

function resolveBoomY(
  input: CameraBoomInput,
  originFollowVoid: boolean,
  originOccupancy: OccupancySample | null,
  occupancy: OccupancySample | null,
  x: number,
  yAlong: number,
  z: number,
): number {
  if (originFollowVoid) {
    const groundY = input.sampleHeight(x, z)
    const follow = isInteriorFollowVoid(occupancy, groundY) ? occupancy : originOccupancy
    if (follow) return clampToOccupancy(yAlong, follow)
    return yAlong
  }
  if (occupancy) return Math.max(yAlong, occupancy.floorY + CAMERA_GROUND_CLEARANCE)
  return Math.max(yAlong, input.sampleHeight(x, z) + CAMERA_GROUND_CLEARANCE)
}

function firstTerrainHitT(
  input: CameraBoomInput,
  dx: number,
  dy: number,
  dz: number,
  dist: number,
): number | null {
  const originBuried = input.originY < input.sampleHeight(input.originX, input.originZ)
  let previousT = 0
  for (let i = 1; i <= TERRAIN_STEPS; i++) {
    const t = i / TERRAIN_STEPS
    if (originBuried && dist * t < CAMERA_TERRAIN_SKIP_DISTANCE) {
      previousT = t
      continue
    }
    const x = input.originX + dx * t
    const y = input.originY + dy * t
    const z = input.originZ + dz * t
    const groundY = input.sampleHeight(x, z)
    if (y < groundY + CAMERA_GROUND_CLEARANCE) return previousT
    previousT = t
  }
  return null
}

function firstTerrainHitFromT(
  input: CameraBoomInput,
  dx: number,
  dy: number,
  dz: number,
  startT: number,
): number | null {
  let previousT = startT
  let wasClear = false
  for (let i = 1; i <= TERRAIN_STEPS; i++) {
    const t = i / TERRAIN_STEPS
    if (t <= startT) continue
    const x = input.originX + dx * t
    const y = input.originY + dy * t
    const z = input.originZ + dz * t
    const groundY = input.sampleHeight(x, z)
    const clear = y >= groundY + CAMERA_GROUND_CLEARANCE
    if (clear) {
      wasClear = true
      previousT = t
      continue
    }
    if (wasClear) return previousT
    previousT = t
  }
  return null
}

type OccupancyMarch =
  | { kind: 'solid', t: number }
  | { kind: 'exit', t: number }
  | { kind: 'void' }

/** Underground non-void is a wall/ceiling/overburden hit. Leaving occupancy
 *  at or above the heightfield is a mouth look-out only when the boom
 *  *origin* is already in the open-sky portal. Interior origin (walking in)
 *  must not park the 12 m boom on the hillside. */
function marchCaveOccupancy(
  input: CameraBoomInput,
  dx: number,
  dy: number,
  dz: number,
  originOcc: OccupancySample | null,
  originFollowVoid: boolean,
): OccupancyMarch {
  const occupancyAt = input.occupancyAt
  if (!occupancyAt) return { kind: 'void' }
  const originOpenSky = Boolean(originOcc?.openSky)
  const originMayLookOut = originOpenSky || !originFollowVoid
  let previousT = 0
  for (let i = 1; i <= TERRAIN_STEPS; i++) {
    const t = i / TERRAIN_STEPS
    const x = input.originX + dx * t
    const y = input.originY + dy * t
    const z = input.originZ + dz * t
    const occ = occupancyAt(x, y, z)
    const groundY = input.sampleHeight(x, z)
    const inVoid = originFollowVoid ? isInteriorFollowVoid(occ, groundY) : occ !== null
    if (inVoid) {
      previousT = t
      continue
    }
    if (y >= groundY - 0.05) {
      if (originMayLookOut) return { kind: 'exit', t: previousT }
      return { kind: 'solid', t: previousT }
    }
    const prevX = input.originX + dx * previousT
    const prevY = input.originY + dy * previousT
    const prevZ = input.originZ + dz * previousT
    const prevOcc = occupancyAt(prevX, prevY, prevZ)
    const prevGround = input.sampleHeight(prevX, prevZ)
    if (
      originMayLookOut
      && prevOcc
      && (prevOcc.openSky || prevOcc.ceilingY >= prevGround - INTERIOR_SURFACE_CLIP)
    ) {
      return { kind: 'exit', t: previousT }
    }
    return { kind: 'solid', t: previousT }
  }
  return { kind: 'void' }
}

/** First t in (0, 1] where the boom enters the collider cylinder below `roofY`. */
function firstCylinderHitT(
  originX: number,
  originY: number,
  originZ: number,
  dx: number,
  dy: number,
  dz: number,
  collider: CircleCollider,
  roofY: number,
): number | null {
  const interval = segmentCircleOverlapT(
    originX,
    originZ,
    dx,
    dz,
    collider.x,
    collider.z,
    collider.radius,
  )
  if (!interval) return null
  const { tEnter, tExit } = interval
  const yEnter = originY + tEnter * dy
  const yExit = originY + tExit * dy
  if (yEnter <= roofY) return tEnter
  if (yExit > roofY) return null
  if (Math.abs(dy) < DEGENERATE) return tEnter
  const tRoof = (roofY - originY) / dy
  if (tRoof >= tEnter && tRoof <= tExit) return tRoof
  return null
}

function segmentCircleOverlapT(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
): { tEnter: number, tExit: number } | null {
  const fx = ox - cx
  const fz = oz - cz
  const a = dx * dx + dz * dz
  const c = fx * fx + fz * fz - radius * radius
  if (a < DEGENERATE) {
    if (c >= 0) return null
    return { tEnter: 0, tExit: 1 }
  }
  const b = 2 * (fx * dx + fz * dz)
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const sqrt = Math.sqrt(disc)
  const inv = 1 / (2 * a)
  let t1 = (-b - sqrt) * inv
  let t2 = (-b + sqrt) * inv
  if (t1 > t2) {
    const tmp = t1
    t1 = t2
    t2 = tmp
  }
  const tEnter = Math.max(t1, 0)
  const tExit = Math.min(t2, 1)
  if (tEnter > tExit) return null
  return { tEnter, tExit }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Wraps a boom `sampleHeight` so that, while the boom's origin sits inside a
 * cave, a query point that falls outside the cave's own footprint reports
 * the origin's own cave floor instead of the surface heightfield high above
 * (world-terrain-008 Milestone A test-environment fix — `groundAt()`-style
 * cave lookups are Y-independent per-point, so a boom sample a few metres to
 * the side of a narrow tunnel can miss the cave and read the real surface).
 * Outside a cave (`originCaveFloorY` is `null`) this is the identity wrapper.
 */
export function withCaveFloorFallback(
  sampleHeight: (x: number, z: number) => number,
  sampleCaveFloor: (x: number, z: number) => number | null,
  originCaveFloorY: number | null,
): (x: number, z: number) => number {
  if (originCaveFloorY == null) return sampleHeight
  return (x, z) => sampleCaveFloor(x, z) ?? originCaveFloorY
}
