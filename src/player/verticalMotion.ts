/** Plan 097 §2.3 — stronger than real gravity (9.81) for a short, readable
 *  arc, matching `items/createDroppedItems.ts`'s falling-item gravity. */
export const GRAVITY = 20
/** Jump apex in metres. `JUMP_SPEED = sqrt(2 * GRAVITY * JUMP_HEIGHT)`. */
export const JUMP_HEIGHT = 0.6
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT)
/** Max snap-down while grounded (metres). Below jump height so a real ledge
 *  still drops; large enough that a 30° slope at sprint doesn't unstick. */
export const STEP_DOWN_MAX = 0.45
/** Impact speed (m/s, downward) required to count as a land for SFX. ~3 m/s
 *  is a ~23 cm fall; a full jump lands at ~JUMP_SPEED (~4.9). */
export const LAND_MIN_SPEED = 3

export type VerticalMotionInput = {
  y: number
  verticalVelocity: number
  grounded: boolean
  groundY: number
  dt: number
  jumpRequested: boolean
  /** Max root Y (cave ceiling minus player height) — `undefined` outside a
   *  cave, where there's nothing overhead to clamp against (plan
   *  world-terrain-007 §19). */
  maxY?: number
}

export type VerticalMotionResult = {
  y: number
  verticalVelocity: number
  grounded: boolean
  tookOff: boolean
  landed: boolean
}

function clampToCeiling(result: VerticalMotionResult, maxY: number | undefined): VerticalMotionResult {
  if (maxY == null || result.y <= maxY) return result
  return { ...result, y: maxY, verticalVelocity: Math.min(result.verticalVelocity, 0) }
}

/** One frame of dry-land gravity / jump / slope-stick (plan 158). Water
 *  swimming stays in `PlayerController` — this helper never sees a water
 *  level. Gravity runs only while airborne so walking a heightfield slope
 *  does not unstick after ~0.5 cm and fire a false land SFX. */
export function integrateVerticalMotion(input: VerticalMotionInput): VerticalMotionResult {
  const { y, groundY, dt } = input
  let { verticalVelocity, grounded } = input
  let tookOff = false

  if (grounded && input.jumpRequested) {
    verticalVelocity = JUMP_SPEED
    grounded = false
    tookOff = true
  }

  if (grounded) {
    if (groundY >= y - STEP_DOWN_MAX) {
      return clampToCeiling({ y: groundY, verticalVelocity: 0, grounded: true, tookOff, landed: false }, input.maxY)
    }
  }

  return clampToCeiling({ ...applyGravity(y, verticalVelocity, groundY, dt), tookOff }, input.maxY)
}

function applyGravity(
  y: number,
  vy: number,
  groundY: number,
  dt: number,
): Omit<VerticalMotionResult, 'tookOff'> {
  const verticalVelocity = vy - GRAVITY * dt
  const nextY = y + verticalVelocity * dt
  if (nextY <= groundY) {
    return {
      y: groundY,
      verticalVelocity: 0,
      grounded: true,
      landed: -verticalVelocity >= LAND_MIN_SPEED,
    }
  }
  return { y: nextY, verticalVelocity, grounded: false, landed: false }
}
