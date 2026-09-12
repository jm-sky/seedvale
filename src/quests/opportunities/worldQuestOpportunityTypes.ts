import type { Role } from '../../ai/characters'
import type { LostLivestockSourceStatus } from '../../fauna/animalStray'
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
export type WorldQuestOpportunityKind = 'wolf-den-pressure' | 'lost-livestock'

/**
 * Authored RPG scenario matrices. Eligibility binds real world refs;
 * materialization builds a normal `QuestDef`.
 *
 * @domain quests-progression
 */
export type RpgQuestMatrixId = 'old-place-secret' | 'suspicious-transport' | 'settlement-agreement'

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

/**
 * Lost household livestock opportunity. `animalId` is the existing
 * persistent livestock identity; `houseId` is the household owner slot.
 *
 * @domain quests-progression
 */
export type LostLivestockOpportunity = {
  id: string
  settlementId: string
  kind: 'lost-livestock'
  houseId: string
  animalId: string
}

/**
 * Lightweight RPG matrix candidate. `sourceId` is a stable world/NPC/settlement
 * ref used both as the quest-id variant and as materialization input.
 *
 * @domain quests-progression
 */
export type RpgQuestOpportunity = {
  id: string
  settlementId: string
  kind: 'rpg-matrix'
  matrixId: RpgQuestMatrixId
  sourceId: string
}

export type SettlementQuestOpportunity = WolfDenPressureOpportunity | LostLivestockOpportunity | RpgQuestOpportunity

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
 * Typed lost-livestock world snapshot. Distinct from binary present/resolved
 * because live return and inspected corpse are different terminals.
 *
 * @domain quests-progression
 */
export type LostLivestockSourceLookup = {
  getSnapshot: (questId: string) => LostLivestockSourceStatus | 'untracked'
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
