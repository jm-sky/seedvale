/** Coarse-pointer / touch-primary heuristic — used to decide whether to show
 *  on-screen touch controls (joystick, look zone, action buttons) instead of
 *  relying on keyboard + pointer-lock mouse look. Cached: the answer doesn't
 *  change over a session and the check runs on several hot paths (CSS class,
 *  per-module UI setup). */
let cached: boolean | null = null

export function isTouchDevice(): boolean {
  if (cached === null) {
    cached =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }
  return cached
}
