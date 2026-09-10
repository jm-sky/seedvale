import type { FamilyMember } from './families'
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
