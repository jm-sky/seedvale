import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { RelationLevel } from '../quests/quests'
import type { Settlement } from './createSettlement'
import type { LodgingOption } from './lodging'
import type { SettlementHouseBed } from './props'
import { homeIndexFromPlaceId } from './places'

/**
 * Lodging resolver (plan 168) — the one place that knows the preference
 * order between bed / friend / paid / hay. `resolveBestLodging` is pure (no
 * world/Three.js access) so the policy stays unit-testable on plain
 * `LodgingOption[]`; `settlementLodgingInput` is the only function here that
 * touches a real `Settlement` (implementation notes §7).
 */

/** Narrow, three.js-free view of a settlement's lodging-relevant state. */
export type LodgingSettlementInput = {
  id: string
  npcs: readonly { name: string, household: { id: string, homeId: string } | null }[]
  /** Index-aligned with the settlement's home `Place` index — same
   *  `landmarks.houses[i]` ↔ `homePlaceId(settlementId, i)` pairing
   *  `createSettlement.ts` already relies on. */
  houses: readonly {
    x: number
    z: number
    /** Plan 169 — physical bed lodging source, `null` for houses with none
     *  (every house except this session's furnished `COTTAGE_4X4_A`, and the
     *  legacy catalog-GLB fallback house). */
    bed: SettlementHouseBed | null
  }[]
  /** A real settlement landmark to anchor the hay fallback on (the garden pad
   *  hay bales are actually placed near — see `props.ts`'s `hayGardens`).
   *  `null` only if the settlement genuinely has none. */
  haySpot: { x: number, z: number } | null
}

export function settlementLodgingInput(settlement: Settlement): LodgingSettlementInput {
  return {
    id: settlement.id,
    npcs: settlement.npcs.map((npc) => ({
      name: npc.name,
      household: npc.household ? { id: npc.household.id, homeId: npc.household.homeId } : null,
    })),
    houses: settlement.landmarks.houses.map((house) => ({
      x: house.position.x,
      z: house.position.z,
      bed: house.bed,
    })),
    haySpot: settlement.landmarks.garden ? { x: settlement.landmarks.garden.x, z: settlement.landmarks.garden.z } : null,
  }
}

const FRIEND_RELATION_LEVELS: ReadonlySet<RelationLevel> = new Set(['friendly', 'trusted'])

function collectBedCandidates(settlement: LodgingSettlementInput): LodgingOption[] {
  const out: LodgingOption[] = []
  settlement.houses.forEach((house, index) => {
    if (!house.bed) return
    out.push({
      id: `${settlement.id}:bed:${index}`,
      type: 'bed',
      settlementId: settlement.id,
      position: house.bed.position,
      approachPoint: house.bed.approach,
      facing: house.bed.facing,
      quality: 'high',
    })
  })
  return out
}

function collectFriendCandidates(
  settlement: LodgingSettlementInput,
  getPlayerSocial: PlayerSocialLookup,
): LodgingOption[] {
  const out: LodgingOption[] = []
  const seenHouseholds = new Set<string>()
  for (const npc of settlement.npcs) {
    const household = npc.household
    if (!household || seenHouseholds.has(household.id)) continue
    if (!FRIEND_RELATION_LEVELS.has(getPlayerSocial(npc.name).relationLevel)) continue
    const houseIndex = homeIndexFromPlaceId(settlement.id, household.homeId)
    const house = houseIndex != null ? settlement.houses[houseIndex] : undefined
    if (!house) continue
    seenHouseholds.add(household.id)
    out.push({
      id: `${settlement.id}:friend:${household.id}`,
      type: 'friend',
      settlementId: settlement.id,
      position: house,
      approachPoint: house,
      facing: null,
      quality: 'normal',
      householdId: household.id,
      ownerName: npc.name,
    })
  }
  return out
}

function collectPaidCandidates(_settlement: LodgingSettlementInput): LodgingOption[] {
  // No paid-lodging provider exists in the current settlement/economy code
  // (implementation notes §10) — kept ready for the first one to register an
  // offer through this same contract, not fabricated here.
  return []
}

function collectHayCandidate(settlement: LodgingSettlementInput): LodgingOption | null {
  if (!settlement.haySpot) return null
  return {
    id: `${settlement.id}:hay`,
    type: 'hay',
    settlementId: settlement.id,
    position: settlement.haySpot,
    approachPoint: settlement.haySpot,
    facing: null,
    quality: 'low',
  }
}

export type LodgingCandidateContext = {
  getPlayerSocial: PlayerSocialLookup
}

export function collectLodgingCandidates(
  settlements: readonly LodgingSettlementInput[],
  ctx: LodgingCandidateContext,
): LodgingOption[] {
  const out: LodgingOption[] = []
  for (const settlement of settlements) {
    out.push(...collectBedCandidates(settlement))
    out.push(...collectFriendCandidates(settlement, ctx.getPlayerSocial))
    out.push(...collectPaidCandidates(settlement))
    const hay = collectHayCandidate(settlement)
    if (hay) out.push(hay)
  }
  return out
}

const TYPE_PRIORITY: Record<LodgingOption['type'], number> = { bed: 4, friend: 3, paid: 2, hay: 1 }
const QUALITY_RANK: Record<LodgingOption['quality'], number> = { high: 3, normal: 2, low: 1 }

function distanceTo(option: LodgingOption, playerPosition: { x: number, z: number }): number {
  return Math.hypot(option.approachPoint.x - playerPosition.x, option.approachPoint.z - playerPosition.z)
}

/**
 * The one authoritative lodging preference policy (plan 168 "Zasady wyboru
 * noclegu"): bed > friend > paid > hay; within one class, quality desc, then
 * travel distance asc, then a stable id tie-break. Distance never overrides
 * the class ordering. Deliberately not randomized (implementation notes §7).
 */
export function resolveBestLodging(
  candidates: readonly LodgingOption[],
  playerPosition: { x: number, z: number },
): LodgingOption | null {
  let best: LodgingOption | null = null
  let bestDistance = Infinity
  for (const option of candidates) {
    const dist = distanceTo(option, playerPosition)
    if (!best) {
      best = option
      bestDistance = dist
      continue
    }
    const typeDelta = TYPE_PRIORITY[option.type] - TYPE_PRIORITY[best.type]
    if (typeDelta > 0) {
      best = option
      bestDistance = dist
      continue
    }
    if (typeDelta < 0) continue
    const qualityDelta = QUALITY_RANK[option.quality] - QUALITY_RANK[best.quality]
    if (qualityDelta > 0) {
      best = option
      bestDistance = dist
      continue
    }
    if (qualityDelta < 0) continue
    if (dist < bestDistance || (dist === bestDistance && option.id < best.id)) {
      best = option
      bestDistance = dist
    }
  }
  return best
}
