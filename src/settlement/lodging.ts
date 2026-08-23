/**
 * Settlement lodging contract (plan 168) — a small, capability-oriented
 * description of "somewhere the player can go and sleep", independent of
 * which concrete source backs it (bed / friend / paid / hay). A
 * `LodgingOption` is a derived offer, resolved fresh each time "Nocuj w
 * mieście" is requested — never cached across frames and never persisted
 * (see the plan's implementation notes §4/§20). The authoritative owner of
 * *why* an option exists stays wherever it always lived (`Household`,
 * `SettlementLandmarks`, and — once plan 169 lands — the physical bed data).
 */

export type LodgingType = 'bed' | 'friend' | 'paid' | 'hay'

export type LodgingQuality = 'high' | 'normal' | 'low'

export type LodgingOption = {
  /** Stable within one resolve/action — not guaranteed to survive a
   *  `WorldBundle` rebuild or a settlement stream-out/in, same lifetime as
   *  the settlement data it's derived from. */
  id: string
  type: LodgingType
  settlementId: string
  /** World position of the lodging source itself (a house, the garden/hay
   *  spot, ...). Plan 169's beds will be the first source where this differs
   *  from `approachPoint`. */
  position: { x: number, z: number }
  /** Where the player actually walks to; arrival is checked against this. */
  approachPoint: { x: number, z: number }
  /** Yaw (radians) the player should face at the actual sleep transition, or
   *  `null` to keep whatever direction they arrived facing. */
  facing: number | null
  quality: LodgingQuality
  /** Owning household, when this option is tied to one (`friend`, and later
   *  `bed`) — the existing `Household.id`, never a duplicated id scheme. */
  householdId?: string
  /** Display name of the NPC offering a `friend` stay. */
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

const LODGING_TYPE_LABEL: Record<LodgingType, string> = {
  bed: 'Łóżko',
  friend: 'Nocleg u znajomego',
  paid: 'Płatny nocleg',
  hay: 'Stóg siana',
}

export function lodgingPlaceLabel(option: LodgingOption): string {
  return option.ownerName
    ? `${LODGING_TYPE_LABEL[option.type]} (${option.ownerName})`
    : LODGING_TYPE_LABEL[option.type]
}

/** What the paid-lodging confirmation UI needs — never the raw
 *  `LodgingOption` itself, so the Vue side can't be tempted to re-derive
 *  price/availability on its own (implementation notes §18). */
export type LodgingConfirmView = {
  placeLabel: string
  price: number
  quality: LodgingQuality
}
