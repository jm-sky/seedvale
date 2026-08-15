import type { PlayerMovementState } from '../player/PlayerController'

/**
 * Pure "does this animal notice the player" check — kept free of `THREE`/DOM
 * so it can be unit tested (see `CLAUDE.md`'s testing split: `src/fauna/`
 * only gets vitest coverage for plain-logic files, not the `AnimalAgent`
 * class itself). Mirrors `interaction/findInteractionTarget.ts::pickInGaze`'s
 * dot-product cone check — `AnimalAgent.ts` computes `facingDot` the same
 * way (using its own `mesh.rotation.y` as forward instead of the player's).
 *
 * Plan 120: detection is a continuous probability (distance × facing ×
 * day/night × forest), rolled against a deterministic dice instead of a hard
 * distance/facing threshold. `detectionProbability` and `detectionRoll` stay
 * separate pure functions (each independently testable); `isPlayerNoticed`
 * just compares one against the other, keeping this module allocation-free
 * and free of `Math.random()`.
 *
 * Plan 124: Sneak folds in as `NoticeParams.stealthMultiplier` — the exact
 * "stealth modifier" extension point plan 120 §7 asked for, applied after
 * distance/facing so `AnimalAgent`/the rest of this pipeline need no
 * changes beyond computing that one number (`sneakDetectionMultiplier`).
 */
export type NoticeParams = {
  /** XZ distance between the animal and the player. */
  distance: number
  /** dot(animalForward, toPlayer) — same convention as `pickInGaze`. Ranges
   *  -1 (player directly behind) to 1 (player directly ahead). */
  facingDot: number
  /** Radius (m) within which the animal is very likely startled regardless
   *  of facing — no longer an absolute cutoff, see `detectionProbability`. */
  panicRange: number
  /** Base "vision" radius before day/night and terrain modifiers, before the
   *  facing-cone falloff even applies. */
  noticeRange: number
  /** 0 (full night) – 1 (full day), from `dayNight.ts::skyParamsFromTime`. */
  dayFactor: number
  /** 0 (open ground) – 1 (dense forest) — dampens noticeRange, never to zero. */
  forestFactor: number
  /** Facing-cone anchor: at this `facingDot`, the facing modifier sits at its
   *  "periphery" floor (see `facingModifier`) rather than gating on/off. */
  minFacingDot: number
  /** Deterministic dice in [0, 1) for this perception check — see
   *  `detectionRoll`. Passed in rather than rolled internally so this stays
   *  a pure function; the caller (`AnimalAgent`) owns roll cadence. */
  roll: number
  /** [0, 1] extra multiplier folded into the final probability, applied
   *  after distance/facing (see `detectionProbability`) — Sneak (plan 124,
   *  `sneakDetectionMultiplier`) or any later stealth modifier. Omitted /
   *  `undefined` means "no effect" (1), so every pre-plan-124 call site and
   *  test keeps its exact prior behaviour. */
  stealthMultiplier?: number
}

/** Night halves the effective notice range at most; forest dampens it by up
 *  to half again — neither ever reaches zero, an animal can still be
 *  startled up close (panicRange) regardless of either. */
const NIGHT_RANGE_FLOOR = 0.5
const FOREST_RANGE_DAMPING = 0.5

export function effectiveNoticeRange(
  noticeRange: number,
  dayFactor: number,
  forestFactor: number,
): number {
  const dayMult = NIGHT_RANGE_FLOOR + (1 - NIGHT_RANGE_FLOOR) * dayFactor
  const forestMult = 1 - forestFactor * FOREST_RANGE_DAMPING
  return noticeRange * dayMult * forestMult
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Probability at distance ≈ 0 — "~99%" per the plan, not 100%: even
 *  point-blank leaves a sliver of a miss. */
const CLOSE_RANGE_PEAK_PROB = 0.99
/** Probability right at the `panicRange` boundary — still "very high" but
 *  distinctly lower than the point-blank peak, and the value the far-range
 *  falloff continues from. */
const PANIC_EDGE_PROB = 0.9
/** Shapes how fast probability drops off between `panicRange` and the
 *  effective notice range edge — higher = probability collapses faster once
 *  past the panic boundary, while staying non-zero until the hard edge. */
const FAR_RANGE_FALLOFF_EXPONENT = 2.2

/** Within `panicRange`, facing doesn't gate detection at all (startled
 *  regardless of where the animal is looking) — only distance shapes the
 *  probability, sliding from `CLOSE_RANGE_PEAK_PROB` at distance 0 down to
 *  `PANIC_EDGE_PROB` at the boundary. */
function closeRangeProbability(distance: number, panicRange: number): number {
  if (panicRange <= 0) return CLOSE_RANGE_PEAK_PROB
  const t = clamp01(distance / panicRange)
  return CLOSE_RANGE_PEAK_PROB + (PANIC_EDGE_PROB - CLOSE_RANGE_PEAK_PROB) * t
}

/** Beyond `panicRange`, continues the falloff from `PANIC_EDGE_PROB` toward
 *  (but not reaching) zero as distance approaches the effective notice
 *  range — "far but in range" always keeps a small, real chance. */
function farRangeProbability(distance: number, panicRange: number, range: number): number {
  const span = range - panicRange
  if (span <= 0) return 0
  const t = clamp01((distance - panicRange) / span)
  return PANIC_EDGE_PROB * (1 - t) ** FAR_RANGE_FALLOFF_EXPONENT
}

/** Modifier at `facingDot === minFacingDot` — used to be the pass/fail
 *  threshold, now the "periphery" floor the front-cone curve rises from. */
const FRONT_MODIFIER_FLOOR = 0.55
/** Modifier at `facingDot === -1` (player directly behind) — never exactly
 *  zero, but low enough to read as "usually not noticed". */
const BEHIND_MODIFIER_FLOOR = 0.03

/** Continuous facing multiplier: 1 dead ahead, `FRONT_MODIFIER_FLOOR` at the
 *  old binary threshold, sliding down to `BEHIND_MODIFIER_FLOOR` directly
 *  behind. Replaces the old `facingDot >= minFacingDot` hard gate (plan 120
 *  §3) without changing how `facingDot` itself is computed. */
function facingModifier(facingDot: number, minFacingDot: number): number {
  const clamped = Math.max(-1, Math.min(1, facingDot))
  if (clamped >= minFacingDot) {
    const span = 1 - minFacingDot
    const t = span > 0 ? (clamped - minFacingDot) / span : 1
    return FRONT_MODIFIER_FLOOR + (1 - FRONT_MODIFIER_FLOOR) * t
  }
  const span = minFacingDot + 1
  const t = span > 0 ? (clamped + 1) / span : 0
  return BEHIND_MODIFIER_FLOOR + (FRONT_MODIFIER_FLOOR - BEHIND_MODIFIER_FLOOR) * t
}

/**
 * Continuous [0, 1] chance of noticing the player this perception check —
 * `base × day/night × forest` (folded into `effectiveNoticeRange`) ×
 * distance falloff × facing modifier, per the plan's pipeline. Zero outside
 * the effective notice range; inside `panicRange`, facing is ignored
 * entirely (startled).
 */
export function detectionProbability(p: Omit<NoticeParams, 'roll'>): number {
  const range = effectiveNoticeRange(p.noticeRange, p.dayFactor, p.forestFactor)
  if (range <= 0 || p.distance >= range) return 0
  const stealth = p.stealthMultiplier ?? 1
  if (p.distance <= p.panicRange) return closeRangeProbability(p.distance, p.panicRange) * stealth
  const distanceProb = farRangeProbability(p.distance, p.panicRange, range)
  return distanceProb * facingModifier(p.facingDot, p.minFacingDot) * stealth
}

/** FNV-1a idiom — same as `settlement/household.ts`/`economy/initial.ts`'s
 *  private `hashString`, reimplemented here to keep this module dependency-
 *  free. */
function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic per-(seed, seed, salt) hash → [0, 1) — same Wang-style
 *  integer mix as `world/weather.ts`'s private `hash01`, reimplemented here
 *  since that module's helper isn't exported and is conceptually weather-
 *  specific. */
function hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

const DETECTION_ROLL_SALT = 0x9e3779b1

/**
 * Deterministic dice in [0, 1) for one animal's perception check — replaces
 * `Math.random()` so identical sim state always yields the identical
 * detection outcome (plan 120 §5). `tick` should advance on the caller's own
 * perception cadence (not once per rendered frame — see `AnimalAgent`'s
 * `PERCEPTION_ROLL_INTERVAL_SEC`), so the roll doesn't re-draw 60x/sec.
 */
export function detectionRoll(animalId: string, tick: number): number {
  return hash01(hashString(animalId), tick, DETECTION_ROLL_SALT)
}

export function isPlayerNoticed(p: NoticeParams): boolean {
  return p.roll < detectionProbability(p)
}

/** Player-side stealth inputs for one perception check (plan 124 §4) —
 *  bundled so `AnimalAgent.update()`/`Fauna.update()` gain one parameter
 *  instead of three, and so later stealth modifiers (movement noise,
 *  visibility/cover) extend this type instead of the call chain. */
export type PlayerStealthState = {
  /** `PlayerSkills['sneak'].value` — [0, 1], fixed at 0.5 until progression
   *  exists (plan 124 §1). */
  sneakValue: number
  /** `PlayerSkills['sneak'].active`. */
  sneakActive: boolean
  movement: PlayerMovementState
}

/** How much of Sneak's benefit survives at each movement tier — faster
 *  movement is noisier, so less of the skill value applies, but sprint
 *  always keeps a sliver (plan 124 §3: "sprint remains possible... low
 *  stealth benefit"). This game has no separate walk/run input (only
 *  moving/sprinting, see `PlayerController.movementState()`), so `moving`
 *  covers both the plan's "walking" and "running" targets. */
const MOVEMENT_STEALTH_FACTOR: Record<PlayerMovementState, number> = {
  stationary: 1,
  moving: 0.7,
  sprinting: 0.25,
}

/** Ceiling on how much Sneak can shrink detection probability — even at full
 *  skill value while stationary, some residual chance always remains (no
 *  hard invisibility toggle, consistent with `detectionProbability` never
 *  hard-zeroing inside the notice range). */
const MAX_STEALTH_REDUCTION = 0.9

/**
 * [0, 1] multiplier for `NoticeParams.stealthMultiplier` — 1 (no effect)
 * when Sneak is inactive or has zero value, otherwise scaled down by skill
 * value × the current movement tier's noise factor, clamped so it never
 * goes negative. Deterministic and side-effect free — same inputs always
 * produce the same multiplier.
 */
export function sneakDetectionMultiplier(state: PlayerStealthState): number {
  if (!state.sneakActive) return 1
  const value = clamp01(state.sneakValue)
  const reduction = value * MOVEMENT_STEALTH_FACTOR[state.movement] * MAX_STEALTH_REDUCTION
  return clamp01(1 - reduction)
}
