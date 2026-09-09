import type { NpcRelationships } from '../settlement/npcRelationships'
import type { NpcAuthoritativeState, NpcId } from '../settlement/npcState'
import {
  hasActiveNpcCorpse,
  isNpcCorpseBuryable,
  npcCorpseBurialClaimOwner,
  recoverStaleNpcBurialClaim,
} from '../settlement/npcPostDeath'
import type { NpcGraves } from '../world/npcGraves'
import { isBurialPlanForDeceased, type NpcPlan } from './npcPlan'

/**
 * Settlement-local burial pressure (plan npc-011) — a fourth independent
 * pressure producer competing in `NpcAgent.choose()` as a `'buryDeceased'`
 * decision target, not a fake `NeedId`.
 *
 * @domain npc
 */

export type NpcBurialHooks = {
  settlementPrefix: string
  householdId: string | null
  getNpcState: (id: NpcId) => NpcAuthoritativeState | undefined
  npcHouseholdId: (id: NpcId) => string | null
  relations: NpcRelationships
  graves: NpcGraves
  listSettlementNpcStates: () => readonly [NpcId, NpcAuthoritativeState][]
}

export type BurialPressureInput = {
  claimantId: NpcId
  claimantHouseholdId: string | null
  claimantPosition: { x: number, z: number }
  settlementPrefix: string
  npcStates: ReadonlyMap<NpcId, NpcAuthoritativeState> | Record<NpcId, NpcAuthoritativeState>
  npcHouseholdId: (npcId: NpcId) => string | null
  relations: NpcRelationships
  graves: NpcGraves
  activePlan: NpcPlan | null
  nowDays: number
}

export type BurialPressureResult = {
  score: number
  deceasedNpcId: string | null
}

const HOUSEHOLD_BURIAL_BASE = 0.62
const RELATION_BURIAL_BASE = 0.42
const RELATION_BURIAL_MAX_BONUS = 0.18
const MAX_BURIAL_DISTANCE = 120
const MIN_BURIAL_DISTANCE = 4

function settlementPrefixFor(npcId: string): string {
  const marker = ':npc:'
  const idx = npcId.lastIndexOf(marker)
  return idx >= 0 ? npcId.slice(0, idx) : ''
}

function distanceScore(dx: number, dz: number): number {
  const dist = Math.hypot(dx, dz)
  if (dist <= MIN_BURIAL_DISTANCE) return 1
  if (dist >= MAX_BURIAL_DISTANCE) return 0
  return 1 - (dist - MIN_BURIAL_DISTANCE) / (MAX_BURIAL_DISTANCE - MIN_BURIAL_DISTANCE)
}

function socialScore(
  claimantId: string,
  deceasedId: string,
  claimantHouseholdId: string | null,
  npcHouseholdId: (npcId: string) => string | null,
  relations: NpcRelationships,
): number {
  const deceasedHouseholdId = npcHouseholdId(deceasedId)
  if (claimantHouseholdId && deceasedHouseholdId && claimantHouseholdId === deceasedHouseholdId) {
    return HOUSEHOLD_BURIAL_BASE
  }
  const relation = relations.get(claimantId, deceasedId)
  if (relation <= 0) return 0
  return RELATION_BURIAL_BASE + Math.min(RELATION_BURIAL_MAX_BONUS, relation / 200)
}

function iterNpcStates(
  npcStates: ReadonlyMap<NpcId, NpcAuthoritativeState> | Record<NpcId, NpcAuthoritativeState>,
): Iterable<[NpcId, NpcAuthoritativeState]> {
  if (npcStates instanceof Map) return npcStates.entries()
  return Object.entries(npcStates)
}

function claimantHasMatchingPlan(activePlan: NpcPlan | null, deceasedId: string): boolean {
  return activePlan != null && isBurialPlanForDeceased(activePlan, deceasedId)
}

export function resolveBurialPressure(input: BurialPressureInput): BurialPressureResult {
  let bestScore = 0
  let bestDeceased: string | null = null

  for (const [deceasedId, state] of iterNpcStates(input.npcStates)) {
    if (deceasedId === input.claimantId) continue
    if (settlementPrefixFor(deceasedId) !== input.settlementPrefix) continue
    if (!state.health.dead) continue
    const post = state.postDeath
    if (!post) continue
    recoverStaleNpcBurialClaim(post, claimantHasMatchingPlan(input.activePlan, deceasedId))
    if (input.graves.hasForDeceased(deceasedId)) continue
    if (!isNpcCorpseBuryable(post, input.nowDays)) continue

    const owner = npcCorpseBurialClaimOwner(post)
    if (owner != null && owner !== input.claimantId) continue
    if (post.status === 'active' && owner == null && !hasActiveNpcCorpse(post)) continue

    const social = socialScore(
      input.claimantId,
      deceasedId,
      input.claimantHouseholdId,
      input.npcHouseholdId,
      input.relations,
    )
    if (social <= 0) continue

    const dx = post.x - input.claimantPosition.x
    const dz = post.z - input.claimantPosition.z
    const score = social * distanceScore(dx, dz)
    if (score <= bestScore) continue
    bestScore = score
    bestDeceased = deceasedId
  }

  return { score: bestScore, deceasedNpcId: bestDeceased }
}

export { settlementPrefixFor }
