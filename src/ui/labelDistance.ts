/** Fully readable up to this distance from the observer (units). */
const LABEL_FADE_NEAR = 20
/** Fully faded out beyond this distance. */
const LABEL_FADE_FAR = 32

/** 1 = fully visible, 0 = fully faded, linear falloff between `near`/`far`.
 *  Defaults match the original NPC-label thresholds — callers with a
 *  different desired fade window (e.g. item pickups, issue 011) pass their
 *  own `near`/`far` instead of new module-level constants. */
export function labelOpacityForDistance(
  distance: number,
  near = LABEL_FADE_NEAR,
  far = LABEL_FADE_FAR,
): number {
  if (distance <= near) return 1
  if (distance >= far) return 0
  return 1 - (distance - near) / (far - near)
}

/** Half-angle (degrees) of the "player is looking toward this" cone — full
 *  width ~90°, per issue 010. */
const GAZE_CONE_HALF_ANGLE_DEG = 45
const GAZE_CONE_MIN_DOT = Math.cos((GAZE_CONE_HALF_ANGLE_DEG * Math.PI) / 180)
/** Opacity multiplier applied outside the gaze cone. */
const OUT_OF_GAZE_OPACITY = 0.5

/** 1 inside a ~90°-wide cone around the observer's facing direction, 0.5
 *  outside it — meant to multiply into a label's distance-based opacity
 *  (`labelOpacityForDistance`), not replace it. `observerYaw` uses the same
 *  convention as `MouseLook`'s `state.yaw`. `dx`/`dz` are target-minus-
 *  observer, world-space. */
export function gazeOpacityFactor(dx: number, dz: number, observerYaw: number): number {
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-4) return 1
  const forwardX = -Math.sin(observerYaw)
  const forwardZ = -Math.cos(observerYaw)
  const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
  return dot >= GAZE_CONE_MIN_DOT ? 1 : OUT_OF_GAZE_OPACITY
}
