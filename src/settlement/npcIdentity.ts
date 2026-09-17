import type { FamilyMember, FamilyMemberRef } from './families'
import type { Household } from './household'
import type { NpcId } from './npcState'
import type { SettlementDef } from './settlementGenerator'

/**
 * Deterministic NPC identity for a settlement member in flattened family
 * order — the same order `createSettlement` uses to spawn NPCs.
 * Stable across stream-out/in and save/load; not a runtime `NpcAgent` handle.
 *
 * @domain settlements-npcs
 */
export function settlementNpcId(settlementId: string, memberIndex: number): NpcId {
  return `${settlementId}:npc:${memberIndex}`
}

/**
 * Settlement members in the same flattened family order used to assign
 * `${settlementId}:npc:${i}` identities. Pure; does not require a live settlement.
 *
 * @domain settlements-npcs
 */
export function flattenedSettlementMembers(
  def: Pick<SettlementDef, 'families'>,
): readonly FamilyMember[] {
  return def.families.flatMap((family) => family.members)
}

/** Pure NPC identity descriptor derived from a `SettlementDef`. */
export type SettlementNpcDescriptor = {
  id: NpcId
  name: string
}

/**
 * NPC identity descriptors from a settlement definition. Order matches
 * `createSettlement` spawning. Does not require a live settlement or `NpcAgent`.
 * Display name is presentation data, not identity.
 *
 * @domain settlements-npcs
 */
export function settlementNpcDescriptors(
  def: Pick<SettlementDef, 'id' | 'families'>,
): readonly SettlementNpcDescriptor[] {
  return flattenedSettlementMembers(def).map((member, i) => ({
    id: settlementNpcId(def.id, i),
    name: member.name,
  }))
}

/** Deterministic per-member physical-profile seed (base SPEA/maxima) —
 *  shared by `createSettlement.ts`'s own residents and foreign-visitor
 *  materialization (plan settlements-npcs-038) so a travelling NPC's
 *  Strength/Agility never drifts between home and a destination settlement. */
export function settlementMemberPhysicalSeed(settlementSeed: number, memberIndex: number): number {
  return settlementSeed ^ Math.imul(memberIndex + 1, 0x51ed270b) ^ 0x50485953
}

/** Inverse of `settlementNpcId` — the flattened member index a given `npcId`
 *  encodes for `settlementId`, or `null` when `npcId` isn't one of that
 *  settlement's numbered members. Mirrors `places.ts`'s `homeIndexFromPlaceId`. */
export function settlementNpcMemberIndex(settlementId: string, npcId: NpcId): number | null {
  const prefix = `${settlementId}:npc:`
  if (!npcId.startsWith(prefix)) return null
  const index = Number(npcId.slice(prefix.length))
  return Number.isInteger(index) && index >= 0 ? index : null
}

/** Pure home-identity descriptor for one settlement member, resolved from a
 *  cached `SettlementDef` alone — no live `Settlement`/`NpcAgent` required. */
export type SettlementNpcHomeDescriptor = {
  npcId: NpcId
  memberIndex: number
  familyIndex: number
  member: FamilyMember
  familyMembers: readonly FamilyMemberRef[]
}

/**
 * Resolve one settlement member's authored identity (role/appearance inputs,
 * family context) purely from a cached `SettlementDef` — used to materialize
 * a travelling NPC's home identity at a foreign destination without
 * loading/building home (plan settlements-npcs-038). `null` when `npcId`
 * doesn't belong to `def`.
 *
 * @domain settlements-npcs
 */
export function resolveSettlementNpcHomeDescriptor(
  def: Pick<SettlementDef, 'id' | 'families'>,
  npcId: NpcId,
): SettlementNpcHomeDescriptor | null {
  const index = settlementNpcMemberIndex(def.id, npcId)
  if (index == null) return null
  let cursor = 0
  for (let familyIndex = 0; familyIndex < def.families.length; familyIndex++) {
    const members = def.families[familyIndex]!.members
    if (index < cursor + members.length) {
      const member = members[index - cursor]!
      const familyMembers = members
        .filter((m) => m !== member)
        .map((m) => ({ name: m.name, lastName: m.lastName, relation: m.relation }))
      return { npcId, memberIndex: index, familyIndex, member, familyMembers }
    }
    cursor += members.length
  }
  return null
}

/**
 * Everything `createSettlement.ts` needs to materialize exactly one live
 * `NpcAgent` for a travelling NPC currently visiting this (foreign)
 * settlement — home identity only, no destination-context fields (plan
 * settlements-npcs-038). `household` is the NPC's real home household
 * (registry-owned, same object as at home) when resolvable.
 */
export type TravellingVisitorSpawn = {
  npcId: NpcId
  member: FamilyMember
  familyMembers: readonly FamilyMemberRef[]
  physicalSeed: number
  household?: Household
}
