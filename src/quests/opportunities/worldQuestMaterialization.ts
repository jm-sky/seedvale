import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { LivestockStrayCandidate } from '../../fauna/animalStray'
import type { SettlementDef } from '../../settlement/settlementGenerator'
import type { QuestDef } from '../quests'
import type {
  LostLivestockOpportunity,
  OpportunityNpc,
  SettlementQuestOpportunity,
  WolfDenPressureOpportunity,
} from './worldQuestOpportunityTypes'
import { flattenedSettlementMembers, settlementNpcId } from '../../settlement/npcIdentity'
import {
  materializeRpgQuestOpportunity,
  type RpgMaterializationContext,
} from './rpgQuestMaterialization'
import {
  collectRpgQuestOpportunities,
  type RpgCollectInput,
} from './rpgQuestMatrices'
import {
  collectSettlementQuestOpportunities,
  LOST_LIVESTOCK_DEAD_OUTCOME,
  LOST_LIVESTOCK_LIVE_OUTCOME,
  LOST_LIVESTOCK_UNAVAILABLE_OUTCOME,
} from './settlementQuestOpportunities'
import { selectSettlementQuestOpportunities } from './settlementQuestSelection'

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
 * RPG matrices pick givers in `rpgQuestMaterialization.ts`.
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
  if (kind === 'lost-livestock') {
    const farmer = pool.find((npc) => npc.role === 'farmer')
    if (farmer) return farmer
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

function materializeLostLivestockQuest(
  opportunity: LostLivestockOpportunity,
  giver: OpportunityNpc,
  settlementName: string,
): QuestDef {
  return {
    id: opportunity.id,
    title: 'Zagubione zwierzę',
    description:
      `Z gospodarstwa w osadzie ${settlementName} zniknęło zwierzę. To to samo, które tam żyło — nie szukaj sobowtóra.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      'Jedno z naszych zwierząt zniknęło z zagrody. Znajdź je, żywym albo nie — musimy wiedzieć, co się stało.',
    stages: [
      {
        objective: { type: 'recover_lost_livestock', animalId: opportunity.animalId },
        description: 'Odnajdź zagubione zwierzę i sprowadź je do zagrody albo zbadaj zwłoki.',
        reminderLine: 'Zwierzę wciąż jest zagubione. Szukaj poza osadą.',
        progressLine: 'Wiem już, co się stało ze zwierzęciem.',
        failLine: 'Zwierzę zniknęło zanim zdążyłeś je odnaleźć.',
      },
    ],
    reportPromptLine: 'Udało ci się odnaleźć to zwierzę?',
    reportPlayerLine: 'Znalazłem wasze zwierzę.',
    reportLine: 'Dzięki. Teraz wiemy, co się z nim stało.',
    settlementId: opportunity.settlementId,
    outcomes: [
      {
        id: LOST_LIVESTOCK_LIVE_OUTCOME,
        state: 'complete',
        resultText: 'Zwierzę wróciło żywe do gospodarstwa.',
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 2 }],
          social: {
            reputation: { competence: 6, courage: 4, benevolence: 8 },
            renown: 6,
          },
        },
      },
      {
        id: LOST_LIVESTOCK_DEAD_OUTCOME,
        state: 'complete',
        resultText: 'Znalazłeś zwłoki zagubionego zwierzęcia.',
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 1 }],
          social: {
            reputation: { competence: 4, courage: 3, benevolence: 5 },
            renown: 3,
          },
        },
      },
      {
        id: LOST_LIVESTOCK_UNAVAILABLE_OUTCOME,
        state: 'failed',
        resultText: 'Zwierzę zniknęło zanim zdążyłeś je odnaleźć.',
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
  rpgContext?: RpgMaterializationContext,
): QuestDef | undefined {
  if (opportunity.kind === 'rpg-matrix') {
    return materializeRpgQuestOpportunity(opportunity, npcs, settlementName, rpgContext)
  }
  const giver = selectSettlementQuestGiver(npcs, opportunity.kind)
  if (!giver) return undefined
  if (opportunity.kind === 'lost-livestock') {
    return materializeLostLivestockQuest(opportunity, giver, settlementName)
  }
  return materializeWolfDenPressureQuest(opportunity, giver, settlementName)
}

/**
 * Builds generated settlement quest definitions for composition-root
 * assembly. World-driven and RPG matrix candidates share one selection
 * layer. Active generated quests reconstruct from persisted ids even when
 * the live problem or eligible source set has changed.
 *
 * @domain quests-progression
 */
export function buildWorldDrivenSettlementQuests(input: {
  settlementId: string
  settlementName: string
  spawners: readonly PreySpawner[]
  npcs: readonly OpportunityNpc[]
  persistedQuestIds?: readonly string[]
  includeWorldDriven?: boolean
  livestock?: readonly LivestockStrayCandidate[]
  rpg?: RpgCollectInput & { context?: RpgMaterializationContext }
}): QuestDef[] {
  const world = input.includeWorldDriven === false
    ? []
    : collectSettlementQuestOpportunities({
      settlementId: input.settlementId,
      spawners: input.spawners,
      persistedQuestIds: input.persistedQuestIds,
      livestock: input.livestock,
    })
  const rpg = input.rpg ? collectRpgQuestOpportunities(input.rpg) : []
  const opportunities = selectSettlementQuestOpportunities({
    candidates: [...world, ...rpg],
    persistedQuestIds: input.persistedQuestIds,
  })
  const defs: QuestDef[] = []
  for (const opportunity of opportunities) {
    const def = materializeSettlementQuestOpportunity(
      opportunity,
      input.npcs,
      input.settlementName,
      input.rpg?.context,
    )
    if (def) defs.push(def)
  }
  return defs
}
