import type { Role } from '../../ai/characters'
import type { NpcId } from '../../settlement/npcState'

/**
 * Lightweight world-driven settlement quest candidate.
 *
 * World/domain state owns the source problem. This record only exposes a
 * detected situation for selection/materialization. A candidate is not a
 * `QuestDef` and is not quest progress.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Data-only opportunity contract between settlement/world systems and quest materialization.
 */
export type WorldQuestOpportunityKind = 'wolf-den-pressure'

/**
 * Wolf-den pressure opportunity for one settlement-owned den.
 * `spawnerId` is the stable fauna habitat id (`${settlementId}:wolfDen`).
 *
 * @domain quests-progression
 */
export type WolfDenPressureOpportunity = {
  id: string
  settlementId: string
  kind: 'wolf-den-pressure'
  spawnerId: string
}

export type SettlementQuestOpportunity = WolfDenPressureOpportunity

/**
 * Live source status for a materialized world-driven quest.
 * `untracked` means QuestManager should ignore the lookup (authored quests).
 *
 * @domain quests-progression
 */
export type WorldQuestSourceStatus = 'untracked' | 'present' | 'resolved' | 'absent'

/**
 * Read-only live source lookup for world-driven quests. QuestManager never
 * imports settlement/fauna managers.
 *
 * @domain quests-progression
 */
export type WorldQuestSourceLookup = {
  getStatus: (questId: string) => WorldQuestSourceStatus
}

/**
 * Deterministic NPC identity for giver selection. Not a runtime `NpcAgent`.
 *
 * @domain quests-progression
 */
export type OpportunityNpc = {
  id: NpcId
  name: string
  role: Role
  child: boolean
}
