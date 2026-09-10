import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { SettlementDef } from '../../settlement/settlementGenerator'
import type { QuestDef } from '../quests'
import type {
  OpportunityNpc,
  SettlementQuestOpportunity,
  WolfDenPressureOpportunity,
} from './worldQuestOpportunityTypes'
import { flattenedSettlementMembers, settlementNpcId } from '../../settlement/npcIdentity'
import { collectSettlementQuestOpportunities } from './settlementQuestOpportunities'

/**
 * Deterministic opportunity NPCs from a settlement definition.
 * Flattened family order matches `createSettlement` spawning.
 *
 * @domain quests-progression
 */
export function opportunityNpcsFromSettlement(
  def: Pick<SettlementDef, 'id' | 'families'>,
): OpportunityNpc[] {
  return flattenedSettlementMembers(def).map((member, i) => ({
    id: settlementNpcId(def.id, i),
    name: member.name,
    role: member.character.role,
    child: member.relation === 'child',
  }))
}

/**
 * Picks a stable settlement NPC to present a world-driven problem.
 * Prefers a hunter for predator sources; otherwise the first adult in
 * flattened family order. Never uses runtime/camera proximity.
 *
 * @domain quests-progression
 */
export function selectSettlementQuestGiver(
  npcs: readonly OpportunityNpc[],
  kind: SettlementQuestOpportunity['kind'],
): OpportunityNpc | undefined {
  const adults = npcs.filter((npc) => !npc.child)
  const pool = adults.length > 0 ? adults : npcs
  if (pool.length === 0) return undefined
  if (kind === 'wolf-den-pressure') {
    const hunter = pool.find((npc) => npc.role === 'hunter')
    if (hunter) return hunter
  }
  return pool[0]
}

function materializeWolfDenPressureQuest(
  opportunity: WolfDenPressureOpportunity,
  giver: OpportunityNpc,
  settlementName: string,
): QuestDef {
  return {
    id: opportunity.id,
    title: 'Wilki pod osadą',
    description:
      `Wilki z pobliskiej jamy zagrażają osadzie ${settlementName}. Źródłem jest prawdziwe siedlisko — samo zabijanie pojedynczych wilków nie wystarczy.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      `Wilki z jamy podchodzą pod ${settlementName} i atakują ludzi. Znajdź to siedlisko i zniszcz je na zawsze.`,
    stages: [
      {
        objective: { type: 'destroy_spawn_point', spawnerId: opportunity.spawnerId },
        description: 'Znajdź wilczą jamę i trwale zniszcz siedlisko.',
        reminderLine: 'Dopóki jama stoi, wilki będą wracać — musisz zniszczyć siedlisko.',
        progressLine: 'Siedlisko zniszczone. Wróć z wieścią.',
        failLine: 'Zagrożenie z jamy zniknęło zanim zdążyłeś zniszczyć siedlisko.',
      },
    ],
    reportPromptLine: 'Udało ci się zniszczyć to siedlisko?',
    reportPlayerLine: 'Zniszczyłem siedlisko. Wilki nie mają już skąd wracać pod osadę.',
    reportLine: 'Dzięki — źródło zagrożenia zniknęło. Osada może odetchnąć.',
    settlementId: opportunity.settlementId,
    outcomes: [
      {
        id: 'den_destroyed',
        state: 'complete',
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 2 }],
          social: {
            reputation: { competence: 8, courage: 10, benevolence: 4 },
            renown: 12,
          },
        },
      },
      {
        id: 'resolved_without_player',
        state: 'failed',
        resultText: 'Zagrożenie z jamy zniknęło zanim zdążyłeś zniszczyć siedlisko.',
      },
    ],
  }
}

/**
 * Materializes a selected opportunity into a normal `QuestDef`.
 * QuestManager owns later quest progress; this function only builds the definition.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Materializes a selected settlement opportunity into a normal QuestDef.
 */
export function materializeSettlementQuestOpportunity(
  opportunity: SettlementQuestOpportunity,
  npcs: readonly OpportunityNpc[],
  settlementName: string,
): QuestDef | undefined {
  const giver = selectSettlementQuestGiver(npcs, opportunity.kind)
  if (!giver) return undefined
  if (opportunity.kind === 'wolf-den-pressure') {
    return materializeWolfDenPressureQuest(opportunity, giver, settlementName)
  }
  return undefined
}

/**
 * Builds generated settlement quest definitions for composition-root
 * assembly. Active generated quests reconstruct from persisted ids even when
 * the live problem has changed.
 *
 * @domain quests-progression
 */
export function buildWorldDrivenSettlementQuests(input: {
  settlementId: string
  settlementName: string
  spawners: readonly PreySpawner[]
  npcs: readonly OpportunityNpc[]
  persistedQuestIds?: readonly string[]
}): QuestDef[] {
  const opportunities = collectSettlementQuestOpportunities({
    settlementId: input.settlementId,
    spawners: input.spawners,
    persistedQuestIds: input.persistedQuestIds,
  })
  const defs: QuestDef[] = []
  for (const opportunity of opportunities) {
    const def = materializeSettlementQuestOpportunity(opportunity, input.npcs, input.settlementName)
    if (def) defs.push(def)
  }
  return defs
}
