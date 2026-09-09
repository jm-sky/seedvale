/**
 * Camp system — the glue that turns campfire + blanket + tent from three
 * unrelated items into one bivouac. Deliberately *not* a manager: nothing
 * here owns world state. It reads a derived `CampRestContext` and returns
 * rest quality plus an explanation the inspection UI can show without
 * recomputing formulas (plan items-player-018).
 *
 * @domain items-player
 */

/** Real contributions for a camp rest, not binary presence. `*Condition = 0`
 *  means "no effective contribution" (no object, or a 0% object). */
export type CampRestContext = {
  /** The blanket: `blanket` in the inventory (the quick action already
   *  requires it) or the tent-rest path's own bedding. */
  hasBlanket: boolean
  /** A *lit* fire close enough to keep the camp warm. */
  hasWarmFire: boolean
  /** Resolved 0..100 tent condition at the camp anchor, or `0` when none. */
  tentCondition: number
  /** Resolved 0..100 condition of the nearest player-built bedroll actually
   *  in use, or `0` when none is nearby. */
  bedrollCondition: number
  /** Resolved 0..100 condition of the platform spatially supporting that
   *  bedroll, or `0` when none — a platform with no bedroll contributes
   *  nothing. */
  platformCondition: number
}

/** One line of the camp-quality explanation. `base` is an absolute quality;
 *  every other key is a delta from the previous sequential step. Summing
 *  `base` plus later deltas equals `quality` (before display rounding). */
export type CampRestExplanationLine = {
  key: 'base' | 'tent' | 'fire' | 'bedroll' | 'platform' | 'survival'
  label: string
  /** Resolved 0..100 condition when the line is about a degraded object. */
  condition?: number
  value: number
}

export type CampRestExplanation = {
  quality: number
  lines: CampRestExplanationLine[]
}

/** XZ metres a player campfire keeps a camp warm over. Small on purpose: a
 *  fire somewhere else in the world must never count. */
export const WARM_FIRE_RADIUS = 6

/** XZ metres from a pitched tent that still counts as sleeping under
 *  shelter — roughly the tent's own footprint plus the blanket beside it. */
export const TENT_SHELTER_RADIUS = 4

type PointLike = { x: number, z: number }

function withinRadius(point: PointLike, x: number, z: number, radius: number): boolean {
  const dx = point.x - x
  const dz = point.z - z
  return dx * dx + dz * dz <= radius * radius
}

/** True when any of `fires` is lit and inside `radius`. An extinguished or
 *  burnt-out fire never contributes warmth, however close it is. */
export function hasWarmFireNear(
  fires: readonly { x: number, z: number, fire: { isLit: () => boolean } }[],
  x: number,
  z: number,
  radius = WARM_FIRE_RADIUS,
): boolean {
  for (const entry of fires) {
    if (!entry.fire.isLit()) continue
    if (withinRadius(entry, x, z, radius)) return true
  }
  return false
}

export function hasTentNear(
  tents: readonly PointLike[],
  x: number,
  z: number,
  radius = TENT_SHELTER_RADIUS,
): boolean {
  for (const tent of tents) {
    if (withinRadius(tent, x, z, radius)) return true
  }
  return false
}

/**
 * Smooth tent shelter factor from resolved tent condition.
 * `100 → 1`, `0 → 0`, no thresholds. Range is clamped to `0..1`.
 *
 * @domain items-player
 */
export function tentShelterFactor(tentCondition: number): number {
  if (!Number.isFinite(tentCondition)) return 0
  return Math.max(0, Math.min(1, tentCondition / 100))
}

/** Fraction of max vigor a night's sleep restores, before Survival. A bare
 *  blanket on the ground is the weakest camp; each added comfort closes part
 *  of the gap to a full night (plan 128 §6's four combinations). Tent
 *  condition interpolates only between the no-tent and full-tent endpoints
 *  of the matching blanket/fire pair (plan items-player-018). */
export const CAMP_REST_BASE_QUALITY = {
  blanket: 0.55,
  blanketFire: 0.75,
  blanketTent: 0.8,
  full: 1,
  /** No bedding at all (tent rest without a blanket) — worse than a bedroll
   *  under the stars is not the point; the tent still shelters, so this sits
   *  just below `blanketTent`. */
  tentOnly: 0.7,
  /** Nothing but the ground. */
  rough: 0.4,
} as const

export const RAISED_BEDROLL_FACTOR_MIN = 0.75
export const RAISED_BEDROLL_FACTOR_MAX = 1

/** How much of the missing quality Survival can claw back at value 1 — a
 *  seasoned survivalist sleeps almost as well on a blanket as in a full camp,
 *  but never quite (plan 128 §3.3). */
const SURVIVAL_REST_COMPENSATION = 0.6

const EXPLANATION_EPSILON = 1e-9

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function withoutTentBase(hasBlanket: boolean, hasWarmFire: boolean): number {
  if (hasBlanket && hasWarmFire) return CAMP_REST_BASE_QUALITY.blanketFire
  if (hasBlanket) return CAMP_REST_BASE_QUALITY.blanket
  return CAMP_REST_BASE_QUALITY.rough
}

function withTentBase(hasBlanket: boolean, hasWarmFire: boolean): number {
  if (hasBlanket && hasWarmFire) return CAMP_REST_BASE_QUALITY.full
  if (hasBlanket) return CAMP_REST_BASE_QUALITY.blanketTent
  return CAMP_REST_BASE_QUALITY.tentOnly
}

function interpolateTentBase(hasBlanket: boolean, hasWarmFire: boolean, tentFactor: number): number {
  const without = withoutTentBase(hasBlanket, hasWarmFire)
  const withTent = withTentBase(hasBlanket, hasWarmFire)
  return without + (withTent - without) * tentFactor
}

function raisedFactor(platformCondition: number): number {
  const t = tentShelterFactor(platformCondition)
  return RAISED_BEDROLL_FACTOR_MIN + (RAISED_BEDROLL_FACTOR_MAX - RAISED_BEDROLL_FACTOR_MIN) * t
}

/** Extra quality a nearby bedroll contributes on top of tent-interpolated
 *  base quality (plan items-player-013 / items-player-018). Additive rather
 *  than a fifth base tier so the existing blanket-driven combinations stay
 *  unchanged when no bedroll is present. */
function bedrollBonus(context: CampRestContext): number {
  const condition = context.bedrollCondition
  if (condition <= 0) return 0
  const shelterFactor = 0.18 + (0.3 - 0.18) * tentShelterFactor(context.tentCondition)
  const fireFactor = context.hasWarmFire ? 1 : 0.6
  return shelterFactor * fireFactor * raisedFactor(context.platformCondition) * (condition / 100)
}

function notable(value: number): boolean {
  return Math.abs(value) > EXPLANATION_EPSILON
}

/**
 * Sequential camp-quality explanation used by both sleep outcome and tent
 * inspection. Vue must not recompute these formulas.
 *
 * @domain items-player
 */
export function explainCampRest(context: CampRestContext, survivalValue: number): CampRestExplanation {
  const tentFactor = tentShelterFactor(context.tentCondition)
  const base = withoutTentBase(context.hasBlanket, false)
  const tentNoFire = interpolateTentBase(context.hasBlanket, false, tentFactor)
  const tentDelta = tentNoFire - base
  const withTentAndFire = interpolateTentBase(context.hasBlanket, context.hasWarmFire, tentFactor)
  const fireDelta = withTentAndFire - tentNoFire
  const bedrollGround = bedrollBonus({ ...context, platformCondition: 0 })
  const bedrollFull = bedrollBonus(context)
  const platformDelta = bedrollFull - bedrollGround
  const afterBonuses = Math.min(1, withTentAndFire + bedrollFull)
  const survival = clamp01(survivalValue)
  const quality = afterBonuses + (1 - afterBonuses) * SURVIVAL_REST_COMPENSATION * survival
  const survivalDelta = quality - afterBonuses

  const lines: CampRestExplanationLine[] = [
    { key: 'base', label: 'Bazowe miejsce odpoczynku', value: base },
  ]
  if (context.tentCondition > 0 && notable(tentDelta)) {
    lines.push({ key: 'tent', label: 'Namiot', condition: context.tentCondition, value: tentDelta })
  }
  if (context.hasWarmFire && notable(fireDelta)) {
    lines.push({ key: 'fire', label: 'Ognisko', value: fireDelta })
  }
  if (context.bedrollCondition > 0 && notable(bedrollGround)) {
    lines.push({ key: 'bedroll', label: 'Posłanie', condition: context.bedrollCondition, value: bedrollGround })
  }
  if (context.platformCondition > 0 && notable(platformDelta)) {
    lines.push({ key: 'platform', label: 'Platforma', condition: context.platformCondition, value: platformDelta })
  }
  if (notable(survivalDelta)) {
    lines.push({ key: 'survival', label: 'Survival', value: survivalDelta })
  }

  return { quality, lines }
}

/**
 * [0,1] fraction of max vigor the finished sleep restores. Deterministic:
 * same context + same Survival value always yields the same number. Survival
 * only ever *reduces* the penalty, so a full camp stays 1 at any skill level.
 */
export function campRestQuality(context: CampRestContext, survivalValue: number): number {
  return explainCampRest(context, survivalValue).quality
}

/** Formats the canonical explanation for FlavorDialog (plan items-player-018). */
export function formatCampRestBreakdown(explanation: CampRestExplanation): string {
  const rows = explanation.lines.map((line) => {
    const condition = line.condition != null ? ` ${Math.round(line.condition)}%` : ''
    const sign = line.key === 'base' || line.value < 0 ? '' : '+'
    return `${line.label}${condition}: ${sign}${Math.round(line.value * 100)}%`
  })
  rows.push('--------------------------------')
  rows.push(`Komfort: ${Math.round(explanation.quality * 100)}%`)
  return rows.join('\n')
}
