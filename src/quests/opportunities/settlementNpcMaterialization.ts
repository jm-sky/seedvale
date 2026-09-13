import type { SettlementDef } from '../../settlement/settlementGenerator'
import { settlementNpcId } from '../../settlement/npcIdentity'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'

/**
 * Settlement NPC row with stable household grouping for quest binding.
 * Member order matches `flattenedSettlementMembers` / `settlementNpcId`.
 *
 * @domain quests-progression
 */
export type SettlementOpportunityNpc = OpportunityNpc & {
  householdId: string
  familyIndex: number
}

/**
 * Deterministic opportunity NPCs with household metadata from a settlement
 * definition — same `NpcId` order as `opportunityNpcsFromSettlement()`.
 *
 * @domain quests-progression
 */
export function settlementOpportunityNpcsFromDef(
  def: Pick<SettlementDef, 'id' | 'families'>,
): SettlementOpportunityNpc[] {
  const out: SettlementOpportunityNpc[] = []
  let memberIndex = 0
  for (const [familyIndex, family] of def.families.entries()) {
    for (const member of family.members) {
      out.push({
        id: settlementNpcId(def.id, memberIndex),
        name: member.name,
        role: member.character.role,
        child: member.relation === 'child',
        householdId: family.id,
        familyIndex,
      })
      memberIndex += 1
    }
  }
  return out
}

/** Flattened settlement members in the same order as `settlementNpcId`. */
export function settlementOpportunityNpcsFlattened(
  npcs: readonly SettlementOpportunityNpc[],
): OpportunityNpc[] {
  return npcs.map(({ id, name, role, child }) => ({ id, name, role, child }))
}
