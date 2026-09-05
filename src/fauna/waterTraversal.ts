/**
 * @domain fauna
 * @system water-traversal
 * @role Pure fauna-side water traversal policy (plan fauna-015) — answers
 *   "what can this species do with these physical water conditions", built
 *   on `terrain/waterSample.ts`'s species-agnostic physical answer. No
 *   Three.js/`AnimalAgent` import so the classification rules are directly
 *   unit-testable. Shared by autonomous and mounted movement alike (both
 *   read it through `AnimalAgent.isWalkable()`), so physical traversability
 *   can never diverge between the two (plan fauna-015 §8).
 */

export type WaterTraversalMode = 'dry' | 'wading' | 'swimming'

/** Minimal declarative per-species water distinction (plan fauna-015 §5) —
 *  deliberately not a wider `waterFear`/`swimSpeed`/`wadeDepth`/`swimDrain`
 *  bag: wade depth already scales from the species' existing `AnimalDef.scale`
 *  (see `wadeDepthFor`), so the only genuinely independent information left
 *  is "can this species swim at all" and "does it swim as well as a duck".
 *  Absent (or an empty object) means the common land-animal default: can
 *  wade, can also swim at the generic exertion cost. */
export type AnimalWaterCapability = {
  /** `false` marks a species that cannot safely swim — water deeper than its
   *  own wading depth is not physically traversable at all (`isWalkable()`
   *  rejects it, same as a collider). Defaults to `true` when unset. */
  canSwim?: boolean
  /** `true` for a species that treats swimming as ordinary locomotion (the
   *  duck case, plan fauna-015 §5) — see `swimStaminaExertion`'s doc for the
   *  effect. Defaults to `false`. */
  waterAdapted?: boolean
}

/** Wading depth (m) at `AnimalDef.scale === 1` — reused, not overridden, by
 *  every species: a small animal's wading depth is proportionally shallower
 *  than a large one's purely from its existing body-scale hint, with no new
 *  per-species `wadeDepth` field (explicitly avoided by the plan). */
const BASE_WADE_DEPTH = 0.5

/** See `BASE_WADE_DEPTH`'s doc — the actual per-species threshold. */
export function wadeDepthFor(scale: number): number {
  return BASE_WADE_DEPTH * scale
}

/** Local water depth (m, `>= 0`) → this species' traversal mode, or `null`
 *  when the water is deeper than the species can safely enter (too deep to
 *  wade, and either `canSwim === false` or — not modeled here, see
 *  `AnimalAgent.isWalkable` — blocked for some other reason). `null` is a
 *  traversal *result*, not a movement mode: callers use it to reject the
 *  candidate point, they never store it as the animal's current state (plan
 *  fauna-015 §2/§7). */
export function classifyWaterTraversal(
  depth: number,
  scale: number,
  capability: AnimalWaterCapability | undefined,
): WaterTraversalMode | null {
  if (depth <= 0) return 'dry'
  if (depth <= wadeDepthFor(scale)) return 'wading'
  if (capability?.canSwim === false) return null
  return 'swimming'
}

/** Generic swim exertion — same order of magnitude as sprinting, since both
 *  drain `AnimalLifeState.stamina` through the same `staminaDrainRate`. */
const SWIM_STAMINA_EXERTION_DEFAULT = 1
/** `waterAdapted` swim exertion (plan fauna-015 §5/§6) — low enough that a
 *  duck floating/swimming normally regenerates faster than it drains net
 *  (`STAMINA_REGEN_RATE` vs. `staminaDrainRate * this`), so ordinary surface
 *  swimming never reads as a short emergency sprint toward drowning. */
const SWIM_STAMINA_EXERTION_ADAPTED = 0.15

/** `tickAnimalLife`'s swim-exertion multiplier for a currently-swimming
 *  animal — pass `undefined` (not this) when the animal isn't swimming, so
 *  the existing sprint/rest stamina bookkeeping is untouched (plan
 *  fauna-015 §6). */
export function swimStaminaExertion(capability: AnimalWaterCapability | undefined): number {
  return capability?.waterAdapted ? SWIM_STAMINA_EXERTION_ADAPTED : SWIM_STAMINA_EXERTION_DEFAULT
}

/** Drowning invariant (plan fauna-015 §7), extracted as a pure predicate so
 *  it's directly unit-testable without instantiating `AnimalAgent`: damage
 *  applies only while actually `swimming` *and* stamina-exhausted.
 *  Exhaustion while `dry`/`wading` is fatigue, never drowning, and leaving
 *  `swimming` (even still exhausted) stops damage immediately — there is no
 *  separate drowning-health countdown. */
export function shouldApplyDrowningDamage(mode: WaterTraversalMode, staminaExhausted: boolean): boolean {
  return mode === 'swimming' && staminaExhausted
}
