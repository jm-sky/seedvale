import type { NpcId } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import type { QuestDef } from './quests'
import { isLostTreasureElderFamily } from '../settlement/lostTreasureChroniclesElderResident'
import { settlementNpcId } from '../settlement/npcIdentity'
import { settlementOpportunityNpcsFromDef } from './opportunities/settlementNpcMaterialization'

export const LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID = 'story:lost-treasure-chronicles:elder:winter'
export const LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID = 'story:lost-treasure-chronicles:elder:dispute'

export const LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME = 'material_help'
export const LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME = 'neighbor_help'
export const LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME = 'support_elder'
export const LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME = 'reconcile'

export const LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT = 6

/**
 * Resolved story binding reconstructed from the elder's settlement definition.
 * Never persisted.
 *
 * @domain quests-progression
 */
export type LostTreasureChroniclesElderBinding = {
  settlementId: string
  settlementName: string
  elderNpcId: NpcId
  elderName: string
  elderHouseholdId: string
  helperNpcId: NpcId
  helperName: string
  counterpartNpcId: NpcId
  counterpartName: string
}

function adultsNotElder(
  npcs: readonly SettlementOpportunityNpc[],
  elderNpcId: NpcId,
): SettlementOpportunityNpc[] {
  return npcs
    .filter((npc) => !npc.child && npc.id !== elderNpcId)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function preferOtherHousehold(
  pool: readonly SettlementOpportunityNpc[],
  elderHouseholdId: string,
): SettlementOpportunityNpc[] {
  const other = pool.filter((npc) => npc.householdId !== elderHouseholdId)
  return other.length > 0 ? other : [...pool]
}

/**
 * Elder plus two supporting adults from the same settlement definition.
 * Supporting NPCs are generated residents selected by stable id, never by display name.
 *
 * @domain quests-progression
 */
export function resolveLostTreasureChroniclesElderBinding(
  def: Pick<SettlementDef, 'id' | 'name' | 'families'>,
): LostTreasureChroniclesElderBinding | null {
  const familyIndex = def.families.findIndex(isLostTreasureElderFamily)
  if (familyIndex < 0) return null
  const family = def.families[familyIndex]!
  const elderMember = family.members[0]
  if (!elderMember) return null

  let memberIndex = 0
  for (let i = 0; i < familyIndex; i++) memberIndex += def.families[i]!.members.length
  const elderNpcId = settlementNpcId(def.id, memberIndex)
  const npcs = settlementOpportunityNpcsFromDef(def)
  const supporting = preferOtherHousehold(adultsNotElder(npcs, elderNpcId), family.id)
  if (supporting.length === 0) return null

  const helper = supporting[0]!
  const counterpart = supporting.find((npc) => npc.id !== helper.id) ?? helper

  return {
    settlementId: def.id,
    settlementName: def.name,
    elderNpcId,
    elderName: elderMember.name,
    elderHouseholdId: family.id,
    helperNpcId: helper.id,
    helperName: helper.name,
    counterpartNpcId: counterpart.id,
    counterpartName: counterpart.name,
  }
}

/**
 * Find the settlement definition that actually hosts the authored elder family.
 *
 * @domain quests-progression
 */
export function findLostTreasureChroniclesElderSettlement(
  defs: readonly Pick<SettlementDef, 'id' | 'name' | 'families'>[],
): (typeof defs)[number] | undefined {
  return defs.find((def) => def.families.some(isLostTreasureElderFamily))
}

/**
 * Winter + dispute quests bound to the guaranteed elder. Ordinary QuestDefs for QuestManager.
 *
 * @domain quests-progression
 */
export function buildLostTreasureChroniclesElderQuests(
  binding: LostTreasureChroniclesElderBinding,
): QuestDef[] {
  const elder = { npcId: binding.elderNpcId }
  const helper = { npcId: binding.helperNpcId }
  const counterpart = { npcId: binding.counterpartNpcId }
  const winterId = LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID
  const disputeId = LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID

  const winter: QuestDef = {
    id: winterId,
    title: 'Przygotowania do zimy',
    description:
      `${binding.elderName} z osady ${binding.settlementName} nie nadąża z przygotowaniem domu na chłodniejsze dni. `
      + 'Możesz donieść mu opał albo namówić sąsiada, żeby pomógł.',
    giverName: binding.elderName,
    giver: elder,
    settlementId: binding.settlementId,
    offerLine:
      'Zima idzie, a ja już nie dźwigam jak kiedyś. Przydałoby się trochę gałęzi na opał… '
      + `albo ktoś z osady, kto zajrzy i dopomoże. ${binding.helperName} dałby radę, tylko sam nie umiem go poprosić.`,
    stages: [{
      objective: { type: 'gather_item', kind: 'branch', count: LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT },
      objectives: [
        {
          id: 'material_help',
          objective: { type: 'gather_item', kind: 'branch', count: LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT },
          resultId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        },
        {
          id: 'neighbor_help',
          objective: { type: 'talk_to_npc', npc: helper },
          resultId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
        },
      ],
      mode: 'any',
      transitions: [
        { resultId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME, toOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME },
        { resultId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME, toOutcomeId: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME },
      ],
      description: `Przynieś gałęzie ${binding.elderName}owi albo namów kogoś z osady, żeby pomógł.`,
      reminderLine: `Jeśli możesz, przynieś gałęzie albo namów ${binding.helperName}, żeby mi pomógł.`,
      progressLine: `Dobrze. Zajrzę do ${binding.elderName}a — nie trzeba, żeby sam pukał.`,
    }],
    reportLine: 'Dziękuję. Z tym drzewem przesiedzę chłodniejsze dni.',
    reportPlayerLine: 'Przyniosłem gałęzie na opał.',
    outcomes: [
      {
        id: LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
        state: 'complete',
        resultText: 'Dziękuję. Z tym drzewem przesiedzę chłodniejsze dni.',
        consequences: {
          relations: [{ npc: elder, delta: 1 }],
          social: { reputation: { benevolence: 2 } },
        },
      },
      {
        id: LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
        state: 'complete',
        resultText: `Podziękuj ${binding.helperName}owi ode mnie. Łatwiej poprosić przez kogoś niż samemu pukać do drzwi.`,
        consequences: {
          relations: [
            { npc: elder, delta: 2 },
            { npc: helper, delta: 1 },
          ],
          social: { reputation: { trust: 1 } },
        },
      },
    ],
  }

  const dispute: QuestDef = {
    id: disputeId,
    title: 'Stara uraza',
    description:
      `${binding.elderName} i ${binding.counterpartName} od lat spierają się o pożyczone narzędzie, które miało wrócić i nie wróciło. `
      + 'Obie strony mają swoją rację.',
    giverName: binding.elderName,
    giver: elder,
    settlementId: binding.settlementId,
    offerLine:
      `Jest jeszcze jedna sprawa, nie na zimę. ${binding.counterpartName} pożyczył ode mnie narzędzie i nigdy go nie oddał. `
      + 'Albo tak twierdzi, że oddał. Posłuchaj go, zanim osądzisz.',
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: winterId,
        outcomeIds: [
          LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME,
          LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME,
        ],
      }],
    },
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: elder },
        description: `Wysłuchaj, jak ${binding.elderName} opowiada o sporze.`,
        reminderLine: `Poszedł do ${binding.counterpartName}a? Niech sam powie, jak było.`,
        playerLine: 'Opowiedz, o co między wami chodzi.',
        progressLine:
          'Pożyczył siekierę na jeden sezon. Minęły lata, a ja jej nie widziałem. '
          + `${binding.counterpartName} mówi, że oddał. Posłuchaj go — niech sam się wytłumaczy.`,
      },
      {
        objective: { type: 'talk_to_npc', npc: counterpart },
        description: `Wysłuchaj wersji ${binding.counterpartName}a.`,
        reminderLine: `${binding.elderName} już ci powiedział swoje. Posłuchaj też drugiej strony.`,
        playerLine: `${binding.elderName} mówi, że narzędzie nigdy nie wróciło.`,
        progressLine:
          'Pożyczyłem, owszem. Potem oddałem — a on mówi, że nie. Nie będę płacił drugi raz za to samo. '
          + 'Niech ktoś wreszcie powie, jak to zamknąć.',
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npc: counterpart,
              outcomeId: LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME,
              npcLine:
                `${binding.elderName} nadal o tym mówi. Jeśli stoisz po jego stronie, powiedz wprost.`,
              playerLine: 'Wyrównaj tę sprawę. Starszy nie odpuści, dopóki tego nie zamkniecie.',
            },
            {
              npc: elder,
              outcomeId: LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME,
              npcLine: 'No i jak? On cię przekonał, czy zostajesz przy mojej wersji?',
              playerLine: 'Zostaw to. Stara uraza nie warta kolejnej zimy.',
              reactions: [
                {
                  when: [{ type: 'relation', npc: elder, maximum: 'acquainted' }],
                  npcLine: 'Łatwo ci mówić. To nie twoja rzecz zniknęła.',
                },
                {
                  when: [{ type: 'relation', npc: elder, minimum: 'trusted' }],
                  npcLine: 'Od kogoś obcego bym tego nie słuchał. Od ciebie… jeszcze przemyślę.',
                },
              ],
            },
          ],
        },
        description: `Zdecyduj, czy stanąć po stronie ${binding.elderName}a, czy namówić go do zgody.`,
        reminderLine: 'Zdecydowałeś już, jak to między nimi zamknąć?',
      },
    ],
    reportLine: 'Wiem już, jak to między wami wygląda.',
    outcomes: [
      {
        id: LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME,
        state: 'complete',
        resultText: 'Dobrze, że ktoś wreszcie powiedział to głośno. Nie będę już sam o to krążył.',
        consequences: {
          relations: [
            { npc: elder, delta: 2 },
            { npc: counterpart, delta: -1 },
          ],
          social: { reputation: { trust: 1, competence: 1 } },
        },
      },
      {
        id: LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME,
        state: 'complete',
        resultText: 'Trudno. Skoro tak mówisz — niech leży. I tak nikt tej siekiery już nie znajdzie.',
        consequences: {
          relations: [
            { npc: elder, delta: 1 },
            { npc: counterpart, delta: 1 },
          ],
          social: { reputation: { benevolence: 2, integrity: 1 } },
        },
      },
    ],
  }

  return [winter, dispute]
}
