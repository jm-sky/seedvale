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

export type CameraBoomInput = {
  originX: number
  originY: number
  originZ: number
  camX: number
  camY: number
  camZ: number
  sampleHeight: (x: number, z: number) => number
  colliders: readonly Collider[]
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
 * it stays out of the heightfield and out of large XZ colliders (houses).
 * Reuses plan 097's `Collider` circles extruded to `CAMERA_OCCLUDER_HEIGHT`
 * — not a new physics system and not a "teleport if black" fallback.
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

  const terrainHit = firstTerrainHitT(input, dx, dy, dz, dist)
  if (terrainHit !== null && terrainHit < hitT) hitT = terrainHit

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
  const t = hitT >= 1 ? 1 : clamp(hitT - pullT, minT, 1)
  const x = input.originX + dx * t
  const z = input.originZ + dz * t
  const y = Math.max(
    input.originY + dy * t,
    input.sampleHeight(x, z) + CAMERA_GROUND_CLEARANCE,
  )
  return { x, y, z, t }
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
