/**
 * Player carry-weight overload (plan 164 §9) — pure, no `THREE`/DOM. One
 * authoritative calc; `PlayerController` stores the result and
 * `app/gameLoop.ts` is the only caller (`inventory.totalWeight()` +
 * `bundle.placedContainers.carriedWeightKg()`, once per frame — cheap, see
 * that call site's comment).
 */
export type Encumbrance = {
  /** `[0,1]` multiplier applied to base movement speed. */
  speedMultiplier: number
  /** True at/above the block threshold — movement is fully disabled. */
  blocked: boolean
  /** `>= 0` fraction over `capacityKg`, e.g. `0.15` = 15% overloaded. */
  overloadFraction: number
}

/** Below this overload, speed is unaffected (plan 164 §9's "0–10%"). */
const FULL_SPEED_OVERLOAD = 0.1
/** At/above this overload, movement is blocked ("`>30%`"). */
const BLOCKED_OVERLOAD = 0.3
/** Speed multiplier reached right at `BLOCKED_OVERLOAD` (plan 164 §9's
 *  "10–30% → ~50–70%") — interpolated smoothly from `1` at `FULL_SPEED_OVERLOAD`. */
const MIN_SPEED_MULTIPLIER = 0.55

/** Smoothstep (derivative 0 at both ends) so the 10%/30% band edges never
 *  produce a visible speed pop (plan 164 §9: "nie powodowała nieprzyjemnych
 *  skoków przy przekraczaniu progów"). */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

export function computeEncumbrance(loadKg: number, capacityKg: number): Encumbrance {
  if (!(capacityKg > 0)) return { speedMultiplier: 1, blocked: false, overloadFraction: 0 }
  const overloadFraction = Math.max(0, (loadKg - capacityKg) / capacityKg)
  if (overloadFraction >= BLOCKED_OVERLOAD) return { speedMultiplier: 0, blocked: true, overloadFraction }
  if (overloadFraction <= FULL_SPEED_OVERLOAD) return { speedMultiplier: 1, blocked: false, overloadFraction }
  const t = (overloadFraction - FULL_SPEED_OVERLOAD) / (BLOCKED_OVERLOAD - FULL_SPEED_OVERLOAD)
  const speedMultiplier = 1 - smoothstep(t) * (1 - MIN_SPEED_MULTIPLIER)
  return { speedMultiplier, blocked: false, overloadFraction }
}
