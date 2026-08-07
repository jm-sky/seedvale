/** Fully readable up to this distance from the observer (units). */
const LABEL_FADE_NEAR = 20
/** Fully faded out beyond this distance. */
const LABEL_FADE_FAR = 32

/** 1 = fully visible, 0 = fully faded, linear falloff between the two thresholds. */
export function labelOpacityForDistance(distance: number): number {
  if (distance <= LABEL_FADE_NEAR) return 1
  if (distance >= LABEL_FADE_FAR) return 0
  return 1 - (distance - LABEL_FADE_NEAR) / (LABEL_FADE_FAR - LABEL_FADE_NEAR)
}
