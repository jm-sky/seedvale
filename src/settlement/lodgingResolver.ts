import type { Role } from '../ai/characters'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { RelationLevel } from '../quests/quests'
import type { ResidentialBuildingRecord } from '../world/residentialBuilding'
import type { Settlement } from './createSettlement'
import type { LodgingOption, LodgingQuality } from './lodging'
import type { SettlementHouseBed } from './props'
import {
  residentialBuildingApproachPoint,
  residentialBuildingLodgingId,
  residentialHomePlaceId,
} from '../world/residentialBuilding'
import { GUARD_PAID_LODGING_PRICE, hayLodgingId, lodgingRequiresPayment } from './lodging'
import { homeIndexFromPlaceId } from './places'

/**
 * Lodging resolver (plan 168 / settlements-npcs-039) — the one place that
 * knows the preference order between owned_house / friend / paid / hay.
 * `resolveBestLodging` is pure (no world/Three.js access) so the policy stays
 * unit-testable on plain `LodgingOption[]`; `settlementLodgingInput` is the
 * only function here that touches a real `Settlement`.
 */

type LodgingNpcInput = {
  id: string
  name: string
  role: Role
  household: { id: string, homeId: string } | null
}

/** Narrow, three.js-free view of a settlement's lodging-relevant state. */
export type LodgingSettlementInput = {
  id: string
  npcs: readonly LodgingNpcInput[]
  /** Index-aligned with the settlement's home `Place` index — same
   *  `landmarks.houses[i]` ↔ `homePlaceId(settlementId, i)` pairing
   *  `createSettlement.ts` already relies on. */
  houses: readonly {
    x: number
    z: number
    /** Physical bed lodging resource, `null` for houses with none. */
    bed: SettlementHouseBed | null
  }[]
  /** A real settlement landmark to anchor the hay fallback on (the garden pad
   *  hay bales are actually placed near — see `props.ts`'s `hayGardens`).
   *  `null` only if the settlement genuinely has none. */
  haySpot: { x: number, z: number } | null
}

/** Nearest of `points` to `from`, or the first entry when `from` is omitted
 *  (a settlement can have up to two physical hay-bale placements, plan 168
 *  hay-range bugfix) — `null` for an empty list. */
function nearestPoint(
  points: readonly { x: number, z: number }[] | undefined,
  from?: { x: number, z: number },
): { x: number, z: number } | null {
  if (!points || points.length === 0) return null
  if (!from) return { x: points[0]!.x, z: points[0]!.z }
  let best = points[0]!
  let bestDist = Math.hypot(best.x - from.x, best.z - from.z)
  for (const p of points.slice(1)) {
    const dist = Math.hypot(p.x - from.x, p.z - from.z)
    if (dist < bestDist) {
      best = p
      bestDist = dist
    }
  }
  return { x: best.x, z: best.z }
}

/** `playerPosition` (optional — only known once a real world is loaded)
 *  picks the *nearest* of a settlement's physical hay-bale placements as the
 *  `hay` fallback's walk-to target, rather than always the first one. */
export function settlementLodgingInput(
  settlement: Settlement,
  playerPosition?: { x: number, z: number },
): LodgingSettlementInput {
  return {
    id: settlement.id,
    npcs: settlement.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      household: npc.household ? { id: npc.household.id, homeId: npc.household.homeId } : null,
    })),
    houses: settlement.landmarks.houses.map((house) => ({
      x: house.position.x,
      z: house.position.z,
      bed: house.bed,
    })),
    // Walk-to target for the resolver's hay fallback — the actual physical
    // hay-bale prop, nearest to the player when position is known, not the
    // garden pad center (see `app/interactables.ts`'s matching fix for why
    // the two differ).
    haySpot: nearestPoint(settlement.landmarks.haySpots, playerPosition)
      ?? { x: settlement.landmarks.garden.x, z: settlement.landmarks.garden.z },
  }
}

const RELATION_RANK: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 0,
  friendly: 1,
  trusted: 2,
}

function friendLodgingQuality(relation: RelationLevel): LodgingQuality | null {
  if (relation === 'trusted') return 'high'
  if (relation === 'friendly') return 'normal'
  return null
}

/** The existing physical-place identity a lodging option resolves to:
 *  the settlement's own house index (index-aligned with `landmarks.houses`,
 *  same one `homeIndexFromPlaceId` already derives from a household's
 *  `homeId`) — not a second id scheme. */
function housePlaceId(settlementId: string, houseIndex: number): string {
  return `${settlementId}:house:${houseIndex}`
}

type FriendContender = {
  npc: LodgingNpcInput
  household: { id: string, homeId: string }
  houseIndex: number
  relation: RelationLevel
  quality: LodgingQuality
}

/**
 * @domain settlements-npcs
 * One free lodging provider per physical house: highest relation
 * (`trusted` > `friendly`), then stable lowest `npc.id`.
 */
function pickFriendProvider(contenders: readonly FriendContender[]): FriendContender {
  let best = contenders[0]!
  for (const candidate of contenders.slice(1)) {
    const relationDelta = RELATION_RANK[candidate.relation] - RELATION_RANK[best.relation]
    if (relationDelta > 0 || (relationDelta === 0 && candidate.npc.id < best.npc.id)) {
      best = candidate
    }
  }
  return best
}

function collectFriendCandidates(
  settlement: LodgingSettlementInput,
  getPlayerSocial: PlayerSocialLookup,
): LodgingOption[] {
  const byPlace = new Map<string, FriendContender[]>()
  for (const npc of settlement.npcs) {
    const household = npc.household
    if (!household) continue
    const houseIndex = homeIndexFromPlaceId(settlement.id, household.homeId)
    if (houseIndex == null) continue
    const house = settlement.houses[houseIndex]
    if (!house?.bed) continue
    const relation = getPlayerSocial({ npcId: npc.id, settlementId: settlement.id }).relationLevel
    const quality = friendLodgingQuality(relation)
    if (!quality) continue
    const placeId = housePlaceId(settlement.id, houseIndex)
    const list = byPlace.get(placeId) ?? []
    list.push({ npc, household, houseIndex, relation, quality })
    byPlace.set(placeId, list)
  }

  const out: LodgingOption[] = []
  for (const [placeId, contenders] of byPlace) {
    const winner = pickFriendProvider(contenders)
    const bed = settlement.houses[winner.houseIndex]!.bed!
    out.push({
      id: `${settlement.id}:friend:${winner.household.id}`,
      type: 'friend',
      settlementId: settlement.id,
      placeId,
      position: bed.position,
      approachPoint: bed.approach,
      facing: bed.facing,
      quality: winner.quality,
      householdId: winner.household.id,
      ownerName: winner.npc.name,
    })
  }
  return out
}

/**
 * @domain settlements-npcs
 * V1 inn stand-in: one guard (lowest stable `npc.id`) offering one paid bed
 * (lowest house index that has a physical bed). The guard need not own the bed.
 */
function collectPaidCandidates(settlement: LodgingSettlementInput): LodgingOption[] {
  let chosenBed: { index: number, bed: SettlementHouseBed } | null = null
  for (let index = 0; index < settlement.houses.length; index++) {
    const bed = settlement.houses[index]?.bed
    if (!bed) continue
    if (!chosenBed || index < chosenBed.index) chosenBed = { index, bed }
  }
  if (!chosenBed) return []

  let guard: LodgingNpcInput | null = null
  for (const npc of settlement.npcs) {
    if (npc.role !== 'guard') continue
    if (!guard || npc.id < guard.id) guard = npc
  }
  if (!guard) return []

  const placeId = housePlaceId(settlement.id, chosenBed.index)
  return [{
    id: `${settlement.id}:paid:${guard.id}`,
    type: 'paid',
    settlementId: settlement.id,
    placeId,
    position: chosenBed.bed.position,
    approachPoint: chosenBed.bed.approach,
    facing: chosenBed.bed.facing,
    quality: 'normal',
    ownerName: guard.name,
    price: GUARD_PAID_LODGING_PRICE,
  }]
}

function collectHayCandidate(settlement: LodgingSettlementInput): LodgingOption | null {
  if (!settlement.haySpot) return null
  return {
    id: hayLodgingId(settlement.id),
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
  /** Completed Player-owned houses (plan settlements-005) — derived, never
   *  persisted. Always included so an out-of-settlement house still
   *  revalidates after a direct `[E]` walk. */
  ownedHouses?: readonly LodgingOption[]
}

export function collectLodgingCandidates(
  settlements: readonly LodgingSettlementInput[],
  ctx: LodgingCandidateContext,
): LodgingOption[] {
  const out: LodgingOption[] = []
  for (const settlement of settlements) {
    out.push(...collectFriendCandidates(settlement, ctx.getPlayerSocial))
    out.push(...collectPaidCandidates(settlement))
    const hay = collectHayCandidate(settlement)
    if (hay) out.push(hay)
  }
  if (ctx.ownedHouses) out.push(...ctx.ownedHouses)
  return dedupeByPhysicalPlace(out)
}

/** Derived lodging for completed Player-owned houses (plan settlements-005
 *  v1) — high quality, no physical bed. Unfinished houses are omitted. */
export function collectOwnedHouseLodgingOptions(
  buildings: readonly ResidentialBuildingRecord[],
): LodgingOption[] {
  const out: LodgingOption[] = []
  for (const record of buildings) {
    if (record.stage !== 'completed' || record.owner.kind !== 'player') continue
    const approach = residentialBuildingApproachPoint(record)
    out.push({
      id: residentialBuildingLodgingId(record.id),
      type: 'owned_house',
      settlementId: record.settlementId ?? '',
      placeId: record.homePlaceId ?? residentialHomePlaceId(record.id),
      position: { x: record.x, z: record.z },
      approachPoint: approach,
      facing: record.yaw,
      quality: 'high',
    })
  }
  return out
}

const TYPE_PRIORITY: Record<LodgingOption['type'], number> = {
  owned_house: 5,
  friend: 4,
  bed: 3,
  paid: 2,
  hay: 1,
}
const QUALITY_RANK: Record<LodgingOption['quality'], number> = { high: 3, normal: 2, low: 1 }

/** Two offers (`friend`/`paid`) can point at the same real house — a player
 *  shouldn't see the same physical place twice in the "Nocuj w mieście"
 *  panel. Keeps the single best option per `placeId` (owned_house > friend >
 *  paid > hay, same as `resolveBestLodging`), and passes through every option
 *  with no `placeId` (`hay`) unchanged. */
function dedupeByPhysicalPlace(candidates: readonly LodgingOption[]): LodgingOption[] {
  const bestByPlace = new Map<string, LodgingOption>()
  const withoutPlace: LodgingOption[] = []
  for (const option of candidates) {
    if (!option.placeId) {
      withoutPlace.push(option)
      continue
    }
    const existing = bestByPlace.get(option.placeId)
    if (!existing || isHigherPriorityLodging(option, existing)) {
      bestByPlace.set(option.placeId, option)
    }
  }
  return [...bestByPlace.values(), ...withoutPlace]
}

function isHigherPriorityLodging(a: LodgingOption, b: LodgingOption): boolean {
  const typeDelta = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]
  if (typeDelta !== 0) return typeDelta > 0
  const qualityDelta = QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality]
  if (qualityDelta !== 0) return qualityDelta > 0
  return a.id < b.id
}

function distanceTo(option: LodgingOption, playerPosition: { x: number, z: number }): number {
  return Math.hypot(option.approachPoint.x - playerPosition.x, option.approachPoint.z - playerPosition.z)
}

/**
 * The one authoritative lodging preference policy (plan settlements-npcs-039):
 * owned_house > friend > paid > hay; within one class, quality desc, then
 * travel distance asc, then a stable id tie-break. Distance never overrides
 * the class ordering. Deliberately not randomized.
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

export type LodgingSelection =
  | { kind: 'unavailable' }
  | { kind: 'confirm', option: LodgingOption }
  | { kind: 'walk', option: LodgingOption }

/**
 * Pure classifier for a player's pick from the "Nocuj w mieście" choice
 * panel (or the hay bale's direct `[E]`, plan 168 follow-up) — always
 * evaluated against a freshly collected candidate list, never a stale
 * snapshot from when the panel was built (implementation notes §4/§8/§11).
 * `restActions.ts` is the only caller that actually commits state; kept pure
 * here so the classification itself stays unit-testable without a
 * `PlayerActionContext`.
 */
export function selectLodgingFromCandidates(
  candidates: readonly LodgingOption[],
  optionId: string,
): LodgingSelection {
  const option = candidates.find((c) => c.id === optionId)
  if (!option) return { kind: 'unavailable' }
  return lodgingRequiresPayment(option) ? { kind: 'confirm', option } : { kind: 'walk', option }
}
