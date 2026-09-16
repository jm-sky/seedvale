import type { ItemInstance } from '../items/itemInstances'
import type { NpcId } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { LostTreasureEstateSearchArea } from '../world/locations/lostTreasureEstateSearchArea'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { LostTreasureChronicleSearchBinding } from './lostTreasureChronicleSearch'
import type { QuestDef, QuestOutcomeId } from './quests'
import { findLostTreasureSpecialistResident } from '../settlement/lostTreasureChroniclesSpecialistResident'
import {
  LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME,
  LOST_TREASURE_CHRONICLE_INSTANCE_ID,
  LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
} from './lostTreasureChronicleSearch'

export const LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID = 'story:lost-treasure-chronicles:chronicle-deciphering'
export const LOST_TREASURE_DECIPHERED_PAID_OUTCOME = 'chronicle_deciphered_paid'
export const LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME = 'chronicle_deciphered_favour'

export const CHRONICLE_REFERENCE_KIND = 'chronicle_reference' as const
export const LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID = 'story:lost-treasure-chronicles:reference'
export const LOST_TREASURE_DECIPHERING_FEE = 35
export const LOST_TREASURE_DECIPHERING_RESERVATION_PREFIX = 'quests-progression-039'

/**
 * Derived chronicle-deciphering binding — reconstructed from seed + world facts.
 *
 * @domain quests-progression
 */
export type LostTreasureChronicleDecipheringBinding = {
  questId: typeof LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID
  searchQuestId: typeof LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID
  archaeologistSettlementId: string
  archaeologistSettlementName: string
  archaeologistNpcId: NpcId
  archaeologistName: string
  specialistSettlementId: string
  specialistSettlementName: string
  specialistNpcId: NpcId
  specialistName: string
  specialistLastName: string
  chronicleInstanceId: typeof LOST_TREASURE_CHRONICLE_INSTANCE_ID
  referenceInstanceId: typeof LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID
  referenceContainerId: string
  referenceContainerX: number
  referenceContainerZ: number
  referenceContainerYaw: number
  searchAreaLocationId: string
  searchAreaX: number
  searchAreaZ: number
  searchAreaRadius: number
  fee: typeof LOST_TREASURE_DECIPHERING_FEE
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createChronicleReferenceInstance(): ItemInstance {
  return { id: LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID, kind: CHRONICLE_REFERENCE_KIND }
}

export function chronicleReferenceContainerId(settlementId: string): string {
  return `world-container:${LOST_TREASURE_DECIPHERING_RESERVATION_PREFIX}:${settlementId}`
}

function referenceContainerPose(
  worldSeed: number,
  settlementId: string,
  x: number,
  z: number,
): { x: number, z: number, yaw: number } {
  const hash = stableHash(`${worldSeed}:${settlementId}:chronicle-reference`)
  const yaw = (hash % 628) / 100
  const offset = 18
  return {
    x: x + Math.cos(yaw) * offset,
    z: z + Math.sin(yaw) * offset,
    yaw,
  }
}

export type ResolveChronicleDecipheringBindingInput = {
  worldSeed: number
  search: LostTreasureChronicleSearchBinding
  specialistDef: SettlementDef
  searchArea: LostTreasureEstateSearchArea
}

/**
 * Resolve the deciphering chapter from the 038 search binding plus specialist
 * and estate-search-area world facts.
 *
 * @domain quests-progression
 */
export function resolveLostTreasureChronicleDecipheringBinding(
  input: ResolveChronicleDecipheringBindingInput,
): LostTreasureChronicleDecipheringBinding | null {
  const specialist = findLostTreasureSpecialistResident(input.specialistDef)
  if (!specialist) return null
  const pose = referenceContainerPose(
    input.worldSeed,
    input.specialistDef.id,
    input.specialistDef.x,
    input.specialistDef.z,
  )
  return {
    questId: LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID,
    searchQuestId: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
    archaeologistSettlementId: input.search.archaeologistSettlementId,
    archaeologistSettlementName: input.search.archaeologistSettlementName,
    archaeologistNpcId: input.search.archaeologistNpcId,
    archaeologistName: input.search.archaeologistName,
    specialistSettlementId: input.specialistDef.id,
    specialistSettlementName: input.specialistDef.name,
    specialistNpcId: specialist.npcId,
    specialistName: specialist.name,
    specialistLastName: specialist.lastName,
    chronicleInstanceId: LOST_TREASURE_CHRONICLE_INSTANCE_ID,
    referenceInstanceId: LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID,
    referenceContainerId: chronicleReferenceContainerId(input.specialistDef.id),
    referenceContainerX: pose.x,
    referenceContainerZ: pose.z,
    referenceContainerYaw: pose.yaw,
    searchAreaLocationId: input.searchArea.locationId,
    searchAreaX: input.searchArea.x,
    searchAreaZ: input.searchArea.z,
    searchAreaRadius: input.searchArea.radius,
    fee: LOST_TREASURE_DECIPHERING_FEE,
  }
}

/**
 * Surface container holding the specialist's missing reference document.
 *
 * @domain quests-progression
 */
export function lostTreasureChronicleReferenceContainerSpec(
  binding: LostTreasureChronicleDecipheringBinding,
): WorldGeneratedContainerSpec {
  return {
    id: binding.referenceContainerId,
    kind: 'chest',
    x: binding.referenceContainerX,
    z: binding.referenceContainerZ,
    yaw: binding.referenceContainerYaw,
    initialCounts: {},
    initialInstances: [createChronicleReferenceInstance()],
  }
}

/**
 * Chronicle-deciphering chapter: pay or recover one reference document.
 *
 * @domain quests-progression
 */
export function buildLostTreasureChronicleDecipheringQuest(
  binding: LostTreasureChronicleDecipheringBinding,
): QuestDef {
  const archaeologist = { npcId: binding.archaeologistNpcId }
  const specialist = { npcId: binding.specialistNpcId }
  const specialistSettlementLocationId = `settlement:${binding.specialistSettlementId}`
  const searchAreaReveal = {
    type: 'reveal_location' as const,
    locationId: binding.searchAreaLocationId,
    setNavigation: true,
  }
  return {
    id: binding.questId,
    title: 'Odczytanie kroniki',
    description:
      `${binding.archaeologistName} nie odczyta zakodowanego fragmentu. ${binding.specialistName} z ${binding.specialistSettlementName} zna to pismo.`,
    giverName: binding.archaeologistName,
    giver: archaeologist,
    settlementId: binding.specialistSettlementId,
    offerLine:
      `Kronika jest autentyczna, ale szyfr miejsca mnie przerasta. W ${binding.specialistSettlementName} mieszka ${binding.specialistName} ${binding.specialistLastName}. On czyta takie pisma.`,
    offer: { exposure: 'story', priority: 23 },
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
        outcomeIds: [LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME],
      }],
    },
    stages: [
      {
        objective: { type: 'await_quest_outcome' },
        description: `Pokaż ${binding.archaeologistName} zakodowaną kronikę.`,
        reminderLine:
          `${binding.archaeologistName} w ${binding.archaeologistSettlementName} rozpozna kronikę, ale nie odczyta szyfru sam.`,
        dialogueActions: [{
          npc: archaeologist,
          playerLine: 'Przynoszę zakodowaną kronikę.',
          npcLine:
            `To autentyczna kronika wyprawy. Część rozumiem, ale szyfr miejsca jest poza moim warsztatem. W ${binding.specialistSettlementName} mieszka ${binding.specialistName} ${binding.specialistLastName} — on czyta takie pisma.`,
          requireItemInstanceId: binding.chronicleInstanceId,
          effects: [{ type: 'reveal_location', locationId: specialistSettlementLocationId }],
        }],
      },
      {
        id: 'choose-route',
        objective: { type: 'await_quest_outcome' },
        description: `Poproś ${binding.specialistName} o odczytanie kroniki — zapłać albo odzyskaj glosariusz.`,
        reminderLine:
          `${binding.specialistName} odczyta szyfr za ${binding.fee} monet albo gdy odzyskasz jego glosariusz z skrzyni na skraju ${binding.specialistSettlementName}.`,
        dialogueActions: [
          {
            npc: specialist,
            playerLine: `Zapłacę ${binding.fee} monet za odczytanie kroniki.`,
            npcLine:
              'Zapłata przyjęta. Kronika mówi, że mapę skarbu oddzielono od niej i zostawiono w starym majątku w ciemnym lesie. Szukaj w oznaczonym obszarze — samego dworu stąd nie wskażę.',
            blockedLine:
              `Nie masz dość monet. Potrzebuję ${binding.fee}, albo przynieś mi brakujący glosariusz.`,
            requireItemInstanceId: binding.chronicleInstanceId,
            transferItemCount: {
              kind: 'coin',
              count: binding.fee,
              toNpc: specialist,
            },
            physicalOutcomeId: LOST_TREASURE_DECIPHERED_PAID_OUTCOME,
          },
          {
            npc: specialist,
            playerLine: 'Pomogę znaleźć ten glosariusz.',
            npcLine:
              `Pożyczyłem go i zostawił w skrzyni na skraju ${binding.specialistSettlementName}. Przynieś ten jeden dokument, a odczytam kronikę bez zapłaty.`,
            requireItemInstanceId: binding.chronicleInstanceId,
          },
        ],
      },
      {
        id: 'recover-reference',
        objective: { type: 'own_item_instance', instanceId: binding.referenceInstanceId },
        transitions: [{ toStageId: 'return-reference' }],
        description: `Odzyskaj glosariusz ${binding.specialistName} ze skrzyni na skraju ${binding.specialistSettlementName}.`,
        reminderLine:
          `Glosariusz leży w skrzyni na skraju ${binding.specialistSettlementName}. To jeden konkretny dokument.`,
      },
      {
        id: 'return-reference',
        objective: { type: 'await_quest_outcome' },
        description: `Oddaj glosariusz ${binding.specialistName}.`,
        reminderLine: `Oddaj ${binding.specialistName} ten sam glosariusz, a odczyta kronikę.`,
        dialogueActions: [{
          npc: specialist,
          playerLine: 'Oddaję glosariusz.',
          npcLine:
            'Dzięki niemu odczytałem resztę. Mapę skarbu oddzielono od kroniki i zostawiono w starym majątku w ciemnym lesie. Szukaj w oznaczonym obszarze — samego dworu stąd nie wskażę.',
          requireItemInstanceId: binding.referenceInstanceId,
          physicalOutcomeId: LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME,
          effects: [{
            type: 'transfer_item_instance',
            instanceId: binding.referenceInstanceId,
            toNpc: specialist,
          }],
        }],
      },
    ],
    reportLine: 'Kronika została odczytana. Wiesz już, w jakim obszarze szukać dawnego majątku.',
    outcomes: [
      {
        id: LOST_TREASURE_DECIPHERED_PAID_OUTCOME,
        state: 'complete',
        resultText:
          'Specjalista odczytał kronikę za opłatą. Mapa skarbu leży w starym majątku w oznaczonym obszarze ciemnego lasu.',
        effects: [searchAreaReveal],
        consequences: {
          relations: [{ npc: specialist, delta: 1 }],
        },
      },
      {
        id: LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME,
        state: 'complete',
        resultText:
          'Specjalista odczytał kronikę po zwrocie glosariusza. Mapa skarbu leży w starym majątku w oznaczonym obszarze ciemnego lasu.',
        effects: [searchAreaReveal],
        consequences: {
          relations: [{ npc: specialist, delta: 2 }],
          social: { reputation: { benevolence: 1 } },
        },
      },
    ],
  }
}

export function isLostTreasureChronicleDeciphered(
  resolvedOutcomeId: (questId: string) => QuestOutcomeId | undefined,
): boolean {
  const outcome = resolvedOutcomeId(LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID)
  return outcome === LOST_TREASURE_DECIPHERED_PAID_OUTCOME
    || outcome === LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME
}
