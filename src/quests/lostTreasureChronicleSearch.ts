import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { ReputationDimension } from '../reputation/ReputationManager'
import type { NpcId } from '../settlement/npcState'
import type { CemeterySize } from '../settlement/props'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import type { ExplicitBuriedPlacement } from '../world/hiddenFinds'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { QuestDef, QuestOutcomeId } from './quests'
import {
  findLostTreasureArchaeologistResident,
} from '../settlement/lostTreasureChroniclesArchaeologistResident'
import { isLostTreasureElderFamily } from '../settlement/lostTreasureChroniclesElderResident'
import { cemeteryGraveLayout } from '../settlement/props'
import { rotateOffsetY } from '../settlement/propUtils'
import {
  LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID,
  LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
  LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
  LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
  type LostTreasureChroniclesElderBinding,
} from './lostTreasureChroniclesElder'
import { type SettlementOpportunityNpc, settlementOpportunityNpcsFromDef } from './opportunities/settlementNpcMaterialization'
import { WORLD_KNOWLEDGE_HOUR_DAYS } from './quests'

export const LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID = 'story:lost-treasure-chronicles:chronicle-search'
export const LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID = 'story:lost-treasure-chronicles:cemetery-favour'
export const LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME = 'chronicle_acquired'
export const LOST_TREASURE_GRAVE_ACCESS_OUTCOME = 'grave_access_granted'

export const ENCODED_CHRONICLE_KIND = 'encoded_chronicle' as const
export const CHRONICLE_SEARCH_EVIDENCE_KIND = 'chronicle_search_evidence' as const

export const LOST_TREASURE_CHRONICLE_INSTANCE_ID = 'story:lost-treasure-chronicles:chronicle'
export const LOST_TREASURE_CHRONICLE_EVIDENCE_INSTANCE_ID = 'story:lost-treasure-chronicles:evidence'

export const LOST_TREASURE_CHRONICLE_SEARCH_RESERVATION_PREFIX = 'quests-progression-038'

export type ChronicleSearchTruth = 'grave' | 'ruins'
export type ChronicleSearchLead = 'basic' | 'strong'

export type ChronicleSearchCemetery = {
  id: string
  x: number
  z: number
  rotationY: number
  scale: number
  cemeterySize: CemeterySize
}

export type ChronicleSearchRuinsLandmark = {
  id: string
  kind: LandmarkKind
  x: number
  z: number
  rotationY: number
  scale: number
}

/**
 * Derived chronicle-search binding — reconstructed from seed + world facts.
 *
 * @domain quests-progression
 */
export type LostTreasureChronicleSearchBinding = {
  questId: typeof LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID
  favourQuestId: typeof LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID
  elderSettlementId: string
  elderSettlementName: string
  elderNpcId: NpcId
  elderName: string
  archaeologistSettlementId: string
  archaeologistSettlementName: string
  archaeologistNpcId: NpcId
  archaeologistName: string
  archaeologistLastName: string
  caretakerNpcId: NpcId
  caretakerName: string
  researcherSurname: string
  cemeteryLocationId: string
  cemeteryLandmarkId: string
  cemeteryX: number
  cemeteryZ: number
  graveIndex: number
  graveSpotId: string
  graveBuriedSpotId: string
  graveX: number
  graveZ: number
  ruinsLandmarkId: string
  ruinsLocationId: string
  ruinsX: number
  ruinsZ: number
  ruinsContainerId: string
  ruinsContainerX: number
  ruinsContainerZ: number
  ruinsContainerYaw: number
  truth: ChronicleSearchTruth
  chronicleInstanceId: typeof LOST_TREASURE_CHRONICLE_INSTANCE_ID
  evidenceInstanceId: typeof LOST_TREASURE_CHRONICLE_EVIDENCE_INSTANCE_ID
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= valueChar(text, i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function valueChar(text: string, i: number): number {
  return text.charCodeAt(i)
}

function adults(npcs: readonly SettlementOpportunityNpc[]): SettlementOpportunityNpc[] {
  return npcs.filter((npc) => !npc.child)
}

function pickCaretaker(
  def: SettlementDef,
  archaeologistNpcId: NpcId,
  archaeologistHouseholdId: string,
): SettlementOpportunityNpc | null {
  const npcs = settlementOpportunityNpcsFromDef(def)
  const pool = adults(npcs).filter((npc) => npc.id !== archaeologistNpcId)
  const other = pool
    .filter((npc) => npc.householdId !== archaeologistHouseholdId)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (other[0]) return other[0]
  return pool.sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
}

const RESEARCHER_SURNAMES = ['Wróbel', 'Gajda', 'Kalina', 'Ostrowski', 'Bielak'] as const

export function lostTreasureResearcherSurname(worldSeed: number): string {
  return RESEARCHER_SURNAMES[stableHash(`lost-treasure-researcher:${worldSeed}`) % RESEARCHER_SURNAMES.length]!
}

export function chronicleSearchRuinsLocationId(landmarkId: string): string {
  return `ruins:chronicle-search:${landmarkId}`
}

export function chronicleSearchGraveBuriedSpotId(cemeteryId: string, graveIndex: number): string {
  return `${LOST_TREASURE_CHRONICLE_SEARCH_RESERVATION_PREFIX}:grave:${cemeteryId}:${graveIndex}`
}

export function chronicleSearchRuinsContainerId(landmarkId: string): string {
  return `world-container:${LOST_TREASURE_CHRONICLE_SEARCH_RESERVATION_PREFIX}:${landmarkId}`
}

export function createEncodedChronicleInstance(): ItemInstance {
  return { id: LOST_TREASURE_CHRONICLE_INSTANCE_ID, kind: ENCODED_CHRONICLE_KIND }
}

export function createChronicleSearchEvidenceInstance(): ItemInstance {
  return { id: LOST_TREASURE_CHRONICLE_EVIDENCE_INSTANCE_ID, kind: CHRONICLE_SEARCH_EVIDENCE_KIND }
}

export function chronicleSearchTruth(
  worldSeed: number,
  cemeteryId: string,
  graveIndex: number,
  ruinsLandmarkId: string,
): ChronicleSearchTruth {
  const hash = stableHash(`${worldSeed}:${cemeteryId}:${graveIndex}:${ruinsLandmarkId}:chronicle-truth`)
  return (hash & 1) === 0 ? 'grave' : 'ruins'
}

function ruinsContainerPose(
  worldSeed: number,
  landmark: ChronicleSearchRuinsLandmark,
): { x: number, z: number, yaw: number } {
  const hash = stableHash(`${worldSeed}:${landmark.id}:chronicle-chest`)
  const yaw = landmark.rotationY + ((hash % 628) / 100)
  const offset = 1.8
  return {
    x: landmark.x + Math.cos(yaw) * offset,
    z: landmark.z + Math.sin(yaw) * offset,
    yaw,
  }
}

function graveWorldPosition(cemetery: ChronicleSearchCemetery, graveIndex: number): { x: number, z: number } {
  const local = cemeteryGraveLayout(cemetery.cemeterySize, cemetery.scale)[graveIndex]
  if (!local) return { x: cemetery.x, z: cemetery.z }
  const rotated = rotateOffsetY(local.x, local.z, cemetery.rotationY)
  return { x: cemetery.x + rotated.x, z: cemetery.z + rotated.z }
}

export type ResolveChronicleSearchBindingInput = {
  worldSeed: number
  elderDef: SettlementDef
  archaeologistDef: SettlementDef
  elderBinding: LostTreasureChroniclesElderBinding
  cemetery: ChronicleSearchCemetery
  ruins: ChronicleSearchRuinsLandmark
}

/**
 * Resolve the chronicle-search world/NPC binding from already-selected sites.
 *
 * @domain quests-progression
 */
export function resolveLostTreasureChronicleSearchBinding(
  input: ResolveChronicleSearchBindingInput,
): LostTreasureChronicleSearchBinding | null {
  const archaeologist = findLostTreasureArchaeologistResident(input.archaeologistDef)
  if (!archaeologist) return null
  if (!input.elderDef.families.some(isLostTreasureElderFamily)) return null
  const caretaker = pickCaretaker(input.archaeologistDef, archaeologist.npcId, archaeologist.householdId)
  if (!caretaker) return null
  const layout = cemeteryGraveLayout(input.cemetery.cemeterySize, input.cemetery.scale)
  if (layout.length === 0) return null
  const graveIndex = stableHash(`${input.cemetery.id}:chronicle-grave`) % layout.length
  const grave = graveWorldPosition(input.cemetery, graveIndex)
  const chest = ruinsContainerPose(input.worldSeed, input.ruins)
  const truth = chronicleSearchTruth(input.worldSeed, input.cemetery.id, graveIndex, input.ruins.id)
  return {
    questId: LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID,
    favourQuestId: LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID,
    elderSettlementId: input.elderBinding.settlementId,
    elderSettlementName: input.elderBinding.settlementName,
    elderNpcId: input.elderBinding.elderNpcId,
    elderName: input.elderBinding.elderName,
    archaeologistSettlementId: input.archaeologistDef.id,
    archaeologistSettlementName: input.archaeologistDef.name,
    archaeologistNpcId: archaeologist.npcId,
    archaeologistName: archaeologist.name,
    archaeologistLastName: archaeologist.lastName,
    caretakerNpcId: caretaker.id,
    caretakerName: caretaker.name,
    researcherSurname: lostTreasureResearcherSurname(input.worldSeed),
    cemeteryLocationId: input.cemetery.id,
    cemeteryLandmarkId: input.cemetery.id,
    cemeteryX: input.cemetery.x,
    cemeteryZ: input.cemetery.z,
    graveIndex,
    graveSpotId: `${input.cemetery.id}:${graveIndex}`,
    graveBuriedSpotId: chronicleSearchGraveBuriedSpotId(input.cemetery.id, graveIndex),
    graveX: grave.x,
    graveZ: grave.z,
    ruinsLandmarkId: input.ruins.id,
    ruinsLocationId: chronicleSearchRuinsLocationId(input.ruins.id),
    ruinsX: input.ruins.x,
    ruinsZ: input.ruins.z,
    ruinsContainerId: chronicleSearchRuinsContainerId(input.ruins.id),
    ruinsContainerX: chest.x,
    ruinsContainerZ: chest.z,
    ruinsContainerYaw: chest.yaw,
    truth,
    chronicleInstanceId: LOST_TREASURE_CHRONICLE_INSTANCE_ID,
    evidenceInstanceId: LOST_TREASURE_CHRONICLE_EVIDENCE_INSTANCE_ID,
  }
}

/**
 * Basic vs strong archaeologist lead — derived, never stored.
 *
 * @domain quests-progression
 */
export function resolveChronicleSearchLead(input: {
  elderRelation: number
  disputeOutcomeId?: QuestOutcomeId
  reputation: Pick<Record<ReputationDimension, number>, 'trust' | 'competence'>
}): ChronicleSearchLead {
  if (input.elderRelation >= 3) return 'strong'
  if (input.disputeOutcomeId && input.elderRelation >= 1) return 'strong'
  if (input.reputation.trust >= 5 && input.reputation.competence >= 3) return 'strong'
  return 'basic'
}

export function chronicleSearchOfferLine(
  binding: LostTreasureChronicleSearchBinding,
  lead: ChronicleSearchLead,
): string {
  const basic =
    `W ${binding.archaeologistSettlementName} mieszka ${binding.archaeologistName} ${binding.archaeologistLastName}. Szuka starej kroniki po zaginionej wyprawie. Przyda mu się ktoś, kto umie szukać w terenie.`
  if (lead === 'basic') return basic
  return `${basic} Zapamiętaj też nazwisko ${binding.researcherSurname}. To on prowadził tamtą wyprawę.`
}

export function isChronicleSearchSourceLooted(
  instances: readonly ItemInstance[],
  instanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === instanceId)
}

function sourceInstance(binding: LostTreasureChronicleSearchBinding, site: ChronicleSearchTruth): ItemInstance {
  const chronicleIsHere = binding.truth === site
  return chronicleIsHere ? createEncodedChronicleInstance() : createChronicleSearchEvidenceInstance()
}

/**
 * Exact buried placement for the researcher grave. Marks the generic grave
 * spot resolved when dug so ordinary Hidden Find loot cannot also fire.
 *
 * @domain quests-progression
 */
export function lostTreasureChronicleGravePlacement(
  binding: LostTreasureChronicleSearchBinding,
): ExplicitBuriedPlacement {
  return {
    spotId: binding.graveBuriedSpotId,
    landmarkId: binding.cemeteryLandmarkId,
    landmarkKind: 'cemetery',
    x: binding.graveX,
    z: binding.graveZ,
    graveIndex: binding.graveIndex,
    instance: sourceInstance(binding, 'grave'),
  }
}

/**
 * Surface ruins container: chronicle XOR evidence, never both.
 *
 * @domain quests-progression
 */
export function lostTreasureChronicleRuinsContainerSpec(
  binding: LostTreasureChronicleSearchBinding,
): WorldGeneratedContainerSpec {
  const instance = sourceInstance(binding, 'ruins')
  const extraCounts: Partial<Record<ItemKind, number>> = { coin: 4 }
  return {
    id: binding.ruinsContainerId,
    kind: 'chest',
    x: binding.ruinsContainerX,
    z: binding.ruinsContainerZ,
    yaw: binding.ruinsContainerYaw,
    initialCounts: extraCounts,
    initialInstances: [instance],
  }
}

function leadResolver(binding: LostTreasureChronicleSearchBinding): QuestDef['resolveOfferLine'] {
  return (input) => {
    const lead = resolveChronicleSearchLead({
      elderRelation: input.getNpcRelation(binding.elderNpcId),
      disputeOutcomeId: input.resolvedOutcomeId(LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID),
      reputation: {
        trust: input.getReputationDimension('trust'),
        competence: input.getReputationDimension('competence'),
      },
    })
    return chronicleSearchOfferLine(binding, lead)
  }
}

/**
 * Chronicle-search chapter + optional cemetery-favour permission quest.
 *
 * @domain quests-progression
 */
export function buildLostTreasureChronicleSearchQuests(
  binding: LostTreasureChronicleSearchBinding,
): QuestDef[] {
  const elder = { npcId: binding.elderNpcId }
  const archaeologist = { npcId: binding.archaeologistNpcId }
  const caretaker = { npcId: binding.caretakerNpcId }
  const search: QuestDef = {
    id: binding.questId,
    title: 'Zakodowana kronika',
    description:
      `${binding.archaeologistName} z ${binding.archaeologistSettlementName} szuka zaginionej kroniki wcześniejszego badacza.`,
    giverName: binding.elderName,
    giver: elder,
    settlementId: binding.elderSettlementId,
    offerLine: chronicleSearchOfferLine(binding, 'basic'),
    resolveOfferLine: leadResolver(binding),
    offer: { exposure: 'story', priority: 22 },
    worldKnowledge: [{
      id: 'ruins',
      revealDelayDays: WORLD_KNOWLEDGE_HOUR_DAYS,
      bind: {
        type: 'landmark',
        kind: binding.ruinsLandmarkId.startsWith('ruins:') ? 'ruins' : 'smallRuins',
        landmarkId: binding.ruinsLandmarkId,
      },
      pendingPhrase: `${binding.archaeologistName} jeszcze składa notatki z wyprawy. Wróć później po dokładniejszy kierunek do ruin.`,
      unavailablePhrase: `${binding.archaeologistName} nie odtworzył trasy do ruin wyprawy.`,
      unavailablePolicy: 'ignore',
    }],
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        outcomeIds: [
          LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
          LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
        ],
      }],
    },
    stages: [
      {
        objective: { type: 'own_item_instance', instanceId: binding.chronicleInstanceId },
        objectives: [
          {
            id: 'already-owned',
            objective: { type: 'own_item_instance', instanceId: binding.chronicleInstanceId },
            resultId: 'owned',
          },
          {
            id: 'meet-archaeologist',
            objective: { type: 'talk_to_npc', npc: archaeologist },
            resultId: 'investigate',
          },
        ],
        mode: 'any',
        transitions: [
          { resultId: 'owned', toOutcomeId: LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME },
          { resultId: 'investigate', toStageId: 'investigate' },
        ],
        description: `Porozmawiaj z ${binding.archaeologistName} w ${binding.archaeologistSettlementName} albo oddaj już zdobytą kronikę do ewidencji wyprawy.`,
        reminderLine: `${binding.archaeologistName} mieszka w ${binding.archaeologistSettlementName}. Ma dwa tropy: grób i ruiny obozu.`,
        playerLine: 'Słyszałem, że szukasz kroniki po dawnej wyprawie.',
        progressLine:
          'Mam dwa tropy: grób badacza i ruiny obozu. Cmentarz mogę wskazać od razu; trasę do ruin muszę jeszcze odtworzyć z notatek.',
        effects: [
          { type: 'reveal_location', locationId: binding.cemeteryLocationId },
          { type: 'request_world_knowledge', knowledgeId: 'ruins' },
        ],
      },
      {
        id: 'investigate',
        objective: { type: 'recover_hidden_find', spotId: binding.graveSpotId },
        objectives: [
          {
            id: 'grave',
            objective: { type: 'recover_hidden_find', spotId: binding.graveSpotId },
            resultId: 'grave',
          },
          {
            id: 'ruins',
            objective: { type: 'loot_world_container', containerId: binding.ruinsContainerId },
            resultId: 'ruins',
          },
        ],
        mode: 'any',
        transitions: [{ toStageId: 'acquire' }],
        description: 'Przeszukaj cmentarz albo ruiny wyprawy — w dowolnej kolejności.',
        reminderLine:
          'Jeden trop to grób badacza. Co do ruin obozu: {worldKnowledgeClue:ruins}.',
        dialogueActions: [{
          npc: archaeologist,
          playerLine: 'Masz już trasę do ruin?',
          npcLine: 'Mam. Szukaj {worldKnowledgeClue:ruins}. Kronika jest tylko w jednym z tych dwóch miejsc.',
          skipAdvance: true,
          requireWorldKnowledgeReady: 'ruins',
          effects: [{ type: 'reveal_location', locationId: binding.ruinsLocationId }],
        }, {
          npc: archaeologist,
          playerLine: 'Jeśli mam iść w ruiny, daj mi resztę notatek.',
          npcLine: 'To, co już dostałeś, wystarczy, żeby ruszyć. Reszty nie będę zgadywał za ciebie.',
          skipAdvance: true,
          reactions: [
            {
              when: [{ type: 'relation', npc: archaeologist, maximum: 'acquainted' }],
              npcLine: 'Najpierw sprawdź to, co już dostałeś. Nie będę zgadywał za ciebie.',
              cooldown: {
                hours: 6,
                line: 'Przejrzyj notatki, które już masz. Potem wrócimy do ruin.',
              },
            },
            {
              when: [{ type: 'relation', npc: archaeologist, minimum: 'friendly' }],
              npcLine: 'Dlatego cię tam wysyłam. Słuchaj uważnie — reszta jest w notatkach, które już masz.',
              consequences: { relations: [{ npc: archaeologist, delta: 1 }] },
            },
          ],
        }],
      },
      {
        id: 'acquire',
        objective: { type: 'own_item_instance', instanceId: binding.chronicleInstanceId },
        transitions: [{ toOutcomeId: LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME }],
        description: 'Zdobądź fizycznie zakodowaną kronikę.',
        reminderLine: 'Kronika musi trafić do twojego ekwipunku. Samo przekopanie tropu nie wystarczy, jeśli zostawisz ją na ziemi.',
      },
    ],
    reportLine: 'Zakodowana kronika jest twoja.',
    outcomes: [{
      id: LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME,
      state: 'complete',
      resultText: 'Odzyskałeś jedyną zakodowaną kronikę tamtej wyprawy.',
      consequences: {
        relations: [
          { npc: elder, delta: 1 },
          { npc: archaeologist, delta: 1 },
        ],
      },
    }],
  }

  const favour: QuestDef = {
    id: binding.favourQuestId,
    title: 'Porządek na cmentarzu',
    description:
      `${binding.caretakerName} z ${binding.archaeologistSettlementName} pozwoli zbadać konkretny grób po drobnej pomocy przy cmentarzu.`,
    giverName: binding.caretakerName,
    giver: caretaker,
    settlementId: binding.archaeologistSettlementId,
    offerLine:
      `Przy mogile ${binding.researcherSurname} leżą powalone gałęzie. Przynieś cztery, to sam pokażę, który grób wolno otworzyć. Bez zgody to zwykłe bezczeszczenie.`,
    offer: { exposure: 'story', priority: 8 },
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID,
        outcomeIds: [
          LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
          LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
        ],
      }],
    },
    stages: [
      {
        objective: { type: 'gather_item', kind: 'branch', count: 4 },
        description: `Zanieś ${binding.caretakerName} cztery gałęzie na porządek przy cmentarzu.`,
        reminderLine: 'Cztery gałęzie i mogę cię wpuścić do tego jednego grobu.',
        playerLine: 'Przynoszę gałęzie na porządek przy mogile.',
      },
    ],
    reportLine: 'Ten jeden grób możesz zbadać. Reszty cmentarza nie ruszaj.',
    reportPlayerLine: 'Oto gałęzie. Chcę legalnie zbadać grób badacza.',
    outcomes: [{
      id: LOST_TREASURE_GRAVE_ACCESS_OUTCOME,
      state: 'complete',
      resultText: 'Dostałeś zgodę na zbadanie konkretnego grobu.',
      consequences: {
        relations: [{ npc: caretaker, delta: 1 }],
        social: { reputation: { trust: 1 } },
      },
    }],
  }

  return [search, favour]
}

export function isLostTreasureGraveAccessGranted(
  resolvedOutcomeId: (questId: string) => QuestOutcomeId | undefined,
): boolean {
  return resolvedOutcomeId(LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID) === LOST_TREASURE_GRAVE_ACCESS_OUTCOME
}
