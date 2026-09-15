import type { FamilyDef, FamilyMember } from '../settlement/families'
import type { NpcAuthoritativeState, NpcId } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { ExpeditionAssignments } from './createExpeditionAssignments'
import type { ExpeditionDestinationRef } from './expedition'
import { settlementNpcId } from '../settlement/npcIdentity'
import { isAdultAge } from '../settlement/professionStaffing'
import {
  EXPEDITION_PARTY_SIZE,
  type ExpeditionAssignmentResult,
} from './expeditionAssignment'

/**
 * Deterministic expedition party selection and household staffing safety
 * (plan settlements-npcs-027). Pure until the registry accepts a `forming` record.
 *
 * @domain settlements-npcs
 */

export type ExpeditionPartyLookups = {
  getNpcState: (npcId: NpcId) => NpcAuthoritativeState | undefined
  findActiveWorkByNpc: (npcId: NpcId) => unknown
  findByCarrier: (npcId: NpcId) => unknown
}

export type RankedExpeditionCandidate = {
  npcId: NpcId
  member: FamilyMember
  family: FamilyDef
  memberIndex: number
  tier: 1 | 2 | 3
}

function isReservedFamily(family: FamilyDef): boolean {
  return family.id.startsWith('family-reserved')
}

export function expeditionCandidateTier(member: FamilyMember): 1 | 2 | 3 | null {
  if (member.character.gender !== 'male') return null
  if (!isAdultAge(member.age)) return null
  if (member.age <= 35 && member.character.role === 'miner') return 1
  if (member.age <= 35) return 2
  if (member.age <= 45) return 3
  return null
}

function isNpcLivingForExpedition(state: NpcAuthoritativeState | undefined): boolean {
  if (!state) return true
  return state.health.dead === false && state.postDeath === null
}

export function isNpcMutablyEligibleForExpedition(
  npcId: NpcId,
  lookups: ExpeditionPartyLookups,
  assignments: ExpeditionAssignments,
): boolean {
  const state = lookups.getNpcState(npcId)
  if (!isNpcLivingForExpedition(state)) return false
  if (assignments.findActiveByNpc(npcId)) return false
  if (state) {
    if (state.helperAssignment !== null) return false
    if (state.accompanyCommitment !== null) return false
    if (state.travel !== null) return false
  }
  if (lookups.findActiveWorkByNpc(npcId) != null) return false
  if (lookups.findByCarrier(npcId) != null) return false
  return true
}

export function listExpeditionCandidates(
  def: Pick<SettlementDef, 'id' | 'families'>,
  lookups: ExpeditionPartyLookups,
  assignments: ExpeditionAssignments,
): RankedExpeditionCandidate[] {
  const out: RankedExpeditionCandidate[] = []
  let memberIndex = 0
  for (const family of def.families) {
    const reserved = isReservedFamily(family)
    for (const member of family.members) {
      const npcId = settlementNpcId(def.id, memberIndex)
      const index = memberIndex
      memberIndex += 1
      if (reserved) continue
      const tier = expeditionCandidateTier(member)
      if (tier == null) continue
      if (!isNpcMutablyEligibleForExpedition(npcId, lookups, assignments)) continue
      out.push({ npcId, member, family, memberIndex: index, tier })
    }
  }
  out.sort((a, b) => a.tier - b.tier || a.memberIndex - b.memberIndex || (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0))
  return out
}

export function canDispatchParty(
  def: Pick<SettlementDef, 'id' | 'families'>,
  memberNpcIds: readonly NpcId[],
  getNpcState: (npcId: NpcId) => NpcAuthoritativeState | undefined,
): boolean {
  const party = new Set(memberNpcIds)
  if (party.size !== memberNpcIds.length) return false

  const rows: { npcId: NpcId, member: FamilyMember, family: FamilyDef }[] = []
  let memberIndex = 0
  for (const family of def.families) {
    for (const member of family.members) {
      rows.push({ npcId: settlementNpcId(def.id, memberIndex), member, family })
      memberIndex += 1
    }
  }

  for (const npcId of memberNpcIds) {
    const row = rows.find((r) => r.npcId === npcId)
    if (!row) return false
    if (!isAdultAge(row.member.age)) return false
    if (!isNpcLivingForExpedition(getNpcState(npcId))) return false
  }

  const remainingAdults = rows.filter((row) => {
    if (party.has(row.npcId)) return false
    if (!isAdultAge(row.member.age)) return false
    return isNpcLivingForExpedition(getNpcState(row.npcId))
  })
  if (remainingAdults.length < 1) return false

  for (const family of def.families) {
    const familyRows = rows.filter((row) => row.family === family)
    const livingMinors = familyRows.filter((row) => (
      !isAdultAge(row.member.age) && isNpcLivingForExpedition(getNpcState(row.npcId))
    ))
    if (livingMinors.length === 0) continue
    const remainingFamilyAdults = familyRows.filter((row) => (
      !party.has(row.npcId)
      && isAdultAge(row.member.age)
      && isNpcLivingForExpedition(getNpcState(row.npcId))
    ))
    if (remainingFamilyAdults.length === 0) return false
  }

  return true
}

export function commitExpeditionParty(params: {
  assignments: ExpeditionAssignments
  def: Pick<SettlementDef, 'id' | 'families'>
  destination: ExpeditionDestinationRef
  nowDays: number
  lookups: ExpeditionPartyLookups
}): ExpeditionAssignmentResult {
  const existing = params.assignments.findActiveBySponsorAndDestination(params.def.id, params.destination)
  if (existing) return { ok: true, assignment: existing }

  const ranked = listExpeditionCandidates(params.def, params.lookups, params.assignments)
  if (ranked.length < EXPEDITION_PARTY_SIZE) {
    return { ok: false, reason: 'not-enough-candidates' }
  }

  const chosen = ranked.slice(0, EXPEDITION_PARTY_SIZE)
  const memberNpcIds: [NpcId, NpcId, NpcId] = [chosen[0]!.npcId, chosen[1]!.npcId, chosen[2]!.npcId]

  for (const npcId of memberNpcIds) {
    if (!isNpcMutablyEligibleForExpedition(npcId, params.lookups, params.assignments)) {
      return { ok: false, reason: 'conflicting-assignment' }
    }
  }

  if (!canDispatchParty(params.def, memberNpcIds, params.lookups.getNpcState)) {
    return { ok: false, reason: 'staffing-unsafe' }
  }

  const assignment = params.assignments.createForming({
    sponsorSettlementId: params.def.id,
    destination: params.destination,
    memberNpcIds,
    createdAtDays: params.nowDays,
  })
  if (!assignment) return { ok: false, reason: 'conflicting-assignment' }
  return { ok: true, assignment }
}
