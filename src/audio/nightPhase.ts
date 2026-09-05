/**
 * @domain world
 * @system ambient-audio
 * @role Shared night-phase primitive (plan world-016) — crickets, the owl
 *   ambient event and frogs all derive their dusk/night/pre-dawn profile
 *   from this one function instead of each re-deriving it from `dayFactor`
 *   (flat across the entire night half, too coarse for a late-night taper).
 */

/** Clock points (`world/dayNight.ts`'s `timeOfDay`) bounding the night half
 *  of the cycle — matches `skyParamsFromTime`'s `elev` zero-crossings
 *  (`0.25` dawn, `0.75` dusk), so this stays in step with the visual
 *  day/night without re-deriving it from `dayFactor`. */
const DUSK = 0.75
const NIGHT_LENGTH = 0.5

/** `timeOfDay` → `[0, 1)` progress from dusk to the next dawn, or `null`
 *  during the day half. Pure, unit-testable in isolation from `dayFactor`. */
export function nightPhase(timeOfDay: number): number | null {
  const sinceDusk = (((timeOfDay - DUSK) % 1) + 1) % 1
  return sinceDusk < NIGHT_LENGTH ? sinceDusk / NIGHT_LENGTH : null
}
