/**
 * Home Kupiec wagon + horse sit beside the market crate. Placement used to be
 * a hardcoded +X offset, which could land the 3.8 m wagon on the log stockpile.
 */

export type WagonObstacle = { x: number, z: number, r: number }

export type MerchantWagonPose = {
  wagonX: number
  wagonZ: number
  horseX: number
  horseZ: number
  yaw: number
}

/** Historic offset `market + (2.8, -0.5)` — try this heading first. */
export const MERCHANT_WAGON_PREFERRED_YAW = Math.atan2(-0.5, 2.8)
export const MERCHANT_WAGON_STALL_DIST = Math.hypot(2.8, 0.5)
export const MERCHANT_WAGON_HORSE_DIST = 1.6
export const MERCHANT_WAGON_RADIUS = 1.2
export const MERCHANT_HORSE_RADIUS = 0.75
/** Crate + nearby barrel — small enough that the preferred stall distance stays clear. */
export const MERCHANT_STALL_RADIUS = 0.75

const ANGLE_COUNT = 12

function minClearance(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly WagonObstacle[],
): number {
  let min = Infinity
  for (const o of obstacles) {
    const gap = Math.hypot(x - o.x, z - o.z) - o.r - radius
    if (gap < min) min = gap
  }
  return min
}

function poseAt(
  stallX: number,
  stallZ: number,
  yaw: number,
  wagonDist: number,
  horseDist: number,
): MerchantWagonPose {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const wagonX = stallX + c * wagonDist
  const wagonZ = stallZ + s * wagonDist
  return {
    wagonX,
    wagonZ,
    horseX: wagonX + c * horseDist,
    horseZ: wagonZ + s * horseDist,
    yaw,
  }
}

/**
 * Pick a stall-adjacent heading for wagon + horse. Prefers the original +X
 * offset when that footprint is clear; otherwise the least-overlapping angle.
 */
export function pickMerchantWagonPose(
  stallX: number,
  stallZ: number,
  obstacles: readonly WagonObstacle[],
): MerchantWagonPose {
  const wagonDist = MERCHANT_WAGON_STALL_DIST
  const horseDist = MERCHANT_WAGON_HORSE_DIST
  const all: WagonObstacle[] = [
    { x: stallX, z: stallZ, r: MERCHANT_STALL_RADIUS },
    ...obstacles,
  ]

  let best: MerchantWagonPose | null = null
  let bestClearance = -Infinity

  for (let i = 0; i < ANGLE_COUNT; i++) {
    const yaw = MERCHANT_WAGON_PREFERRED_YAW + (i * Math.PI * 2) / ANGLE_COUNT
    const pose = poseAt(stallX, stallZ, yaw, wagonDist, horseDist)
    const clearance = Math.min(
      minClearance(pose.wagonX, pose.wagonZ, MERCHANT_WAGON_RADIUS, all),
      minClearance(pose.horseX, pose.horseZ, MERCHANT_HORSE_RADIUS, all),
    )
    if (clearance >= 0) return pose
    if (clearance > bestClearance) {
      bestClearance = clearance
      best = pose
    }
  }

  return best ?? poseAt(stallX, stallZ, MERCHANT_WAGON_PREFERRED_YAW, wagonDist, horseDist)
}
