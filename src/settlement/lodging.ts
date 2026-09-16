/**
 * Settlement lodging contract (plan 168 / settlements-npcs-039) — a small,
 * capability-oriented description of "somewhere the player can go and sleep",
 * independent of which concrete source backs it (friend / paid / hay /
 * owned_house). A `LodgingOption` is a derived offer, resolved fresh each
 * time "Nocuj w mieście" is requested — never cached across frames and never
 * persisted. The authoritative owner of *why* an option exists stays
 * wherever it always lived (`Household`, settlement furniture, player-owned
 * houses, `PlayerSocialLookup`).
 */

export type LodgingType = 'bed' | 'friend' | 'paid' | 'hay' | 'owned_house'

export type LodgingQuality = 'high' | 'normal' | 'low'

export type LodgingOption = {
  /** Stable within one resolve/action — not guaranteed to survive a
   *  `WorldBundle` rebuild or a settlement stream-out/in, same lifetime as
   *  the settlement data it's derived from. */
  id: string
  type: LodgingType
  settlementId: string
  /** Identity of the *physical* place this option sleeps at — the existing
   *  house index (`${settlementId}:house:${houseIndex}`), shared by `friend`
   *  and `paid` when they resolve to the same house so the resolver can
   *  collapse colliding offers into a single panel entry. Never set for
   *  `hay`, which has no house collision. */
  placeId?: string
  /** World position of the lodging source itself (a physical bed, hay
   *  spot, or owned-house footprint). */
  position: { x: number, z: number }
  /** Where the player actually walks to; arrival is checked against this. */
  approachPoint: { x: number, z: number }
  /** Yaw (radians) the player should face at the actual sleep transition, or
   *  `null` to keep whatever direction they arrived facing. */
  facing: number | null
  quality: LodgingQuality
  /** Owning household, when this option is tied to one (`friend`) — the
   *  existing `Household.id`, never a duplicated id scheme. */
  householdId?: string
  /** Display name of the NPC offering a `friend` or `paid` stay. */
  ownerName?: string
  /** Coin price — only set for `paid`. */
  price?: number
}

/** [0,1] fraction `restoreNeedsFromSleep` restores to. A lodging-specific
 *  mapping, deliberately separate from `campRest.ts`'s blanket/tent/fire
 *  quality — plan 165/`PlayerNeeds` stays the only owner of what the
 *  fraction actually restores (implementation notes §15). */
const LODGING_QUALITY_VALUE: Record<LodgingQuality, number> = {
  high: 1,
  normal: 0.75,
  low: 0.45,
}

export function lodgingRestQuality(quality: LodgingQuality): number {
  return LODGING_QUALITY_VALUE[quality]
}

/** World units the player must be within an option's `approachPoint` for
 *  arrival to count — small enough that reaching it means actually walking
 *  there, generous enough that the destination doesn't need pixel-perfect
 *  pathing (there is no pathfinding, only a straight-line walk). */
export const LODGING_ARRIVE_TOLERANCE = 1.6

/** Minimum XZ-distance-to-`approachPoint` improvement (world units) that
 *  counts as real lodging-walk progress (plan `ui-input-005`) — filters out
 *  per-frame floating-point jitter while a player pressed against a wall
 *  still reads as "no progress". */
export const LODGING_STUCK_PROGRESS_EPSILON = 0.05

/** Seconds of no meaningful lodging-walk progress before stuck-recovery
 *  kicks in (plan `ui-input-005`) — long enough that a normal, if slow, walk
 *  across a settlement is never cut short (walk speed is 8 m/s), short
 *  enough that a player stuck on a house collider isn't stranded. */
export const LODGING_STUCK_TIMEOUT_SEC = 12

/** V1 paid settlement lodging price (plan settlements-npcs-039) — a guard
 *  stands in for an innkeeper; the cost is a player charge, not inn income. */
export const GUARD_PAID_LODGING_PRICE = 2

/** Pure state `restActions.ts::tickLodging()` carries across frames for the
 *  active `lodgingWalkTarget` — the closest XZ distance to `approachPoint`
 *  reached so far this walk, and how many seconds have elapsed since it last
 *  improved by more than `LODGING_STUCK_PROGRESS_EPSILON`. */
export type LodgingProgress = { bestDistance: number | null, stuckSeconds: number }

export function initialLodgingProgress(): LodgingProgress {
  return { bestDistance: null, stuckSeconds: 0 }
}

/** @domain ui-input
 *  Advances the lodging-walk stuck watchdog by one frame — a meaningful
 *  distance improvement resets the timer, otherwise `dt` accumulates until
 *  `LODGING_STUCK_TIMEOUT_SEC` is reached. Pure and frame-count-independent
 *  (driven by `dt`, not calls) so it can be unit-tested without a running
 *  game loop or a `PlayerActionContext` mock. */
export function advanceLodgingProgress(
  progress: LodgingProgress,
  distance: number,
  dt: number,
): { state: LodgingProgress, stuck: boolean } {
  if (progress.bestDistance === null || distance < progress.bestDistance - LODGING_STUCK_PROGRESS_EPSILON) {
    return { state: { bestDistance: distance, stuckSeconds: 0 }, stuck: false }
  }
  const stuckSeconds = progress.stuckSeconds + dt
  return { state: { bestDistance: progress.bestDistance, stuckSeconds }, stuck: stuckSeconds >= LODGING_STUCK_TIMEOUT_SEC }
}

const LODGING_TYPE_LABEL: Record<LodgingType, string> = {
  bed: 'Łóżko',
  friend: 'Nocleg u znajomego',
  paid: 'Płatny nocleg',
  hay: 'Stóg siana',
  owned_house: 'Własna chata',
}

export function lodgingPlaceLabel(option: LodgingOption): string {
  if (option.type === 'friend' && option.ownerName) return `U ${option.ownerName}`
  if (option.type === 'paid' && option.ownerName) return `Nocleg u strażnika: ${option.ownerName}`
  return LODGING_TYPE_LABEL[option.type]
}

/** True when a candidate needs the existing pay-then-arm-movement flow
 *  (`restActions.ts`'s confirm step) rather than arming movement directly —
 *  the one place this money gate is decided (implementation notes §11). */
export function lodgingRequiresPayment(option: LodgingOption): boolean {
  return option.type === 'paid' && (option.price ?? 0) > 0
}

const LODGING_QUALITY_LABEL: Record<LodgingQuality, string> = {
  high: 'Komfortowo',
  normal: 'Dość wygodnie',
  low: 'Niewygodnie',
}

/** Polish coin-count wording for lodging labels only — not a localization framework. */
function coinCountLabel(count: number): string {
  const abs = Math.abs(count)
  const mod100 = abs % 100
  const mod10 = abs % 10
  if (mod10 === 1 && mod100 !== 11) return `${count} moneta`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} monety`
  return `${count} monet`
}

/** Button label for the "Nocuj w mieście" choice panel
 *  (plan settlements-npcs-039) — provider/place plus quality, and price for paid. */
export function lodgingChoiceLabel(option: LodgingOption): string {
  const place = lodgingPlaceLabel(option)
  const quality = LODGING_QUALITY_LABEL[option.quality]
  return lodgingRequiresPayment(option)
    ? `${place} — ${coinCountLabel(option.price ?? 0)} — ${quality}`
    : `${place} — ${quality}`
}

/** Stable id for a settlement's hay-fallback `LodgingOption` — shared by the
 *  resolver (`collectHayCandidate`) and the hay bale's direct `[E]`
 *  interaction (`RestActions.sleepInHay`) so both resolve to the exact same
 *  candidate, never a second id scheme. */
export function hayLodgingId(settlementId: string): string {
  return `${settlementId}:hay`
}
