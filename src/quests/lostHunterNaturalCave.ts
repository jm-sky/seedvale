import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import type { QuestDef } from './quests'
import { CaveAuthoredAnchorClaims } from '../world/caves/caveAuthoredAnchorClaims'
import { caveWorldLocationId } from '../world/locations/darkForestTreasureSite'

export const LOST_HUNTER_QUEST_PREFIX = 'world:lost-hunter:'

export const LOST_HUNTER_RETURN_BOW_OUTCOME = 'return_bow_to_family'
export const LOST_HUNTER_KEEP_BOW_OUTCOME = 'report_fate_keep_bow'

/**
 * Derived world/quest binding — reconstructed on each boot, never persisted.
 *
 * @domain quests-progression
 */
export type LostHunterNaturalCaveBinding = {
  questId: string
  settlementId: string
  giverNpcId: NpcId
  witnessNpcId: NpcId
  caveId: string
  caveLocationId: string
  storyAnchorId: string
  lootAnchorId: string
  packContainerId: string
  bowInstanceId: string
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function lostHunterBowInstanceId(caveId: string): string {
  return `quest:lost-hunter:${caveId}:bow`
}

export function lostHunterPackContainerId(lootAnchorId: string): string {
  return `world-container:quests-progression-023:${lootAnchorId}`
}

export function lostHunterQuestId(settlementId: string, caveId: string): string {
  return `${LOST_HUNTER_QUEST_PREFIX}${settlementId}:${caveId}`
}

export function parseLostHunterQuestId(questId: string): { settlementId: string, caveId: string } | null {
  if (!questId.startsWith(LOST_HUNTER_QUEST_PREFIX)) return null
  const rest = questId.slice(LOST_HUNTER_QUEST_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon <= 0 || colon === rest.length - 1) return null
  return { settlementId: rest.slice(0, colon), caveId: rest.slice(colon + 1) }
}

export function createLostHunterBowInstance(caveId: string): ItemInstance {
  return { id: lostHunterBowInstanceId(caveId), kind: 'hunting_bow' }
}

const PACK_SUPPLY: Partial<Record<ItemKind, number>> = {
  dried_meat: 2,
  waterskin_small: 1,
  bandage: 1,
}

function naturalCaveAnchorPairs(
  caveIds: readonly string[],
  archetypeOf: (caveId: string) => CaveArchetype | null,
  contentAnchors: readonly CaveContentAnchor[],
): { caveId: string, storyAnchorId: string, lootAnchorId: string }[] {
  const pairs: { caveId: string, storyAnchorId: string, lootAnchorId: string }[] = []
  for (const caveId of caveIds) {
    if (archetypeOf(caveId) !== 'natural') continue
    const story = contentAnchors.find((a) => a.caveId === caveId && a.role === 'storyFind')
    const loot = contentAnchors.find((a) => a.caveId === caveId && a.role === 'loot')
    if (!story || !loot) continue
    pairs.push({ caveId, storyAnchorId: story.id, lootAnchorId: loot.id })
  }
  return pairs.sort((a, b) => a.caveId.localeCompare(b.caveId))
}

function adults(npcs: readonly SettlementOpportunityNpc[]): SettlementOpportunityNpc[] {
  return npcs.filter((npc) => !npc.child)
}

function plausibleGiverHousehold(npc: SettlementOpportunityNpc, npcs: readonly SettlementOpportunityNpc[]): boolean {
  const members = npcs.filter((entry) => entry.householdId === npc.householdId)
  const adultCount = adults(members).length
  if (adultCount >= 2) return true
  return adultCount >= 1 && members.length >= 2
}

function witnessRolePool(pool: readonly SettlementOpportunityNpc[]): SettlementOpportunityNpc[] {
  const hunters = pool.filter((npc) => npc.role === 'hunter').slice().sort((a, b) => a.id.localeCompare(b.id))
  if (hunters.length > 0) return hunters
  const woodcutters = pool.filter((npc) => npc.role === 'woodcutter').slice().sort((a, b) => a.id.localeCompare(b.id))
  if (woodcutters.length > 0) return woodcutters
  return pool.slice().sort((a, b) => a.id.localeCompare(b.id))
}

export function selectLostHunterNpcs(
  npcs: readonly SettlementOpportunityNpc[],
  settlementId: string,
  worldSeed: number,
): { giver: SettlementOpportunityNpc, witness: SettlementOpportunityNpc } | null {
  const pool = adults(npcs)
  if (pool.length < 2) return null
  const giverCandidates = pool
    .filter((npc) => plausibleGiverHousehold(npc, npcs))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  if (giverCandidates.length === 0) return null
  const giverPick = stableHash(`${worldSeed}\0${settlementId}\0lost-hunter-giver`) % giverCandidates.length
  const giver = giverCandidates[giverPick]!
  const witnessPool = pool.filter((npc) => npc.id !== giver.id)
  const witnessCandidates = witnessRolePool(witnessPool)
  if (witnessCandidates.length === 0) return null
  const witnessPick = stableHash(`${worldSeed}\0${settlementId}\0lost-hunter-witness`) % witnessCandidates.length
  const witness = witnessCandidates[witnessPick]!
  if (witness.id === giver.id) return null
  return { giver, witness }
}

export function resolveLostHunterNaturalCaveBinding(input: {
  worldSeed: number
  settlementDef: Pick<SettlementDef, 'id' | 'families'>
  caveIds: readonly string[]
  archetypeOf: (caveId: string) => CaveArchetype | null
  contentAnchors: readonly CaveContentAnchor[]
  claims: CaveAuthoredAnchorClaims
  npcs: readonly SettlementOpportunityNpc[]
}): LostHunterNaturalCaveBinding | null {
  const npcPick = selectLostHunterNpcs(input.npcs, input.settlementDef.id, input.worldSeed)
  if (!npcPick) return null
  const pairs = naturalCaveAnchorPairs(input.caveIds, input.archetypeOf, input.contentAnchors)
  const eligible = pairs.filter((pair) => (
    !input.claims.isClaimed(pair.storyAnchorId) && !input.claims.isClaimed(pair.lootAnchorId)
  ))
  if (eligible.length === 0) return null
  const pick = stableHash(`${input.worldSeed}\0${input.settlementDef.id}\0lost-hunter-cave`) % eligible.length
  const { caveId, storyAnchorId, lootAnchorId } = eligible[pick]!
  if (!input.claims.tryClaimNaturalStoryPair(storyAnchorId, lootAnchorId)) return null
  const bowInstanceId = lostHunterBowInstanceId(caveId)
  return {
    questId: lostHunterQuestId(input.settlementDef.id, caveId),
    settlementId: input.settlementDef.id,
    giverNpcId: npcPick.giver.id,
    witnessNpcId: npcPick.witness.id,
    caveId,
    caveLocationId: caveWorldLocationId(caveId),
    storyAnchorId,
    lootAnchorId,
    packContainerId: lostHunterPackContainerId(lootAnchorId),
    bowInstanceId,
  }
}

export function lostHunterPackContainerSpec(
  binding: LostHunterNaturalCaveBinding,
  lootAnchor: CaveContentAnchor,
): WorldGeneratedContainerSpec {
  return {
    id: binding.packContainerId,
    kind: 'chest',
    x: lootAnchor.x,
    y: lootAnchor.y,
    z: lootAnchor.z,
    yaw: lootAnchor.yaw,
    initialCounts: PACK_SUPPLY,
    initialInstances: [createLostHunterBowInstance(binding.caveId)],
    spatialContext: { kind: 'cave', caveId: binding.caveId },
  }
}

export function isLostHunterPackLooted(
  instances: readonly ItemInstance[],
  bowInstanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === bowInstanceId)
}

/**
 * Materializes the lost-hunter quest for one resolved binding.
 *
 * @domain quests-progression
 */
export function buildLostHunterNaturalCaveQuest(
  binding: LostHunterNaturalCaveBinding,
  npcs: readonly SettlementOpportunityNpc[],
  settlementName: string,
): QuestDef {
  const giver = npcs.find((npc) => npc.id === binding.giverNpcId)
  const witness = npcs.find((npc) => npc.id === binding.witnessNpcId)
  const giverName = giver?.name ?? 'Rodzina'
  const witnessName = witness?.name ?? 'Świadek'
  return {
    id: binding.questId,
    title: 'Zaginiony myśliwy',
    description:
      `${giverName} z osady ${settlementName} szuka wieści o myśliwym, który nie wrócił z wyprawy.`,
    giverName,
    giver: { npcId: binding.giverNpcId },
    settlementId: binding.settlementId,
    offerLine:
      'Mój bliski wyruszył na polowanie i nie wrócił. Nie wiem, co się stało — może ktoś widział go ostatni.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: { npcId: binding.witnessNpcId } },
        description: `Porozmawiaj z ${witnessName} — może widział zaginionego myśliwego.`,
        reminderLine: `${witnessName} może coś wiedzieć o jego ostatniej drodze.`,
        playerLine: 'Słyszałem, że zaginął myśliwy. Widziałeś go ostatnio?',
        progressLine: 'Wiem już, gdzie szukać — trzeba zajrzeć do tej jaskini.',
        effects: [{
          type: 'reveal_location',
          locationId: binding.caveLocationId,
          setNavigation: true,
        }],
      },
      {
        objective: { type: 'loot_world_container', containerId: binding.packContainerId },
        description: 'Znajdź w jaskini jego plecak i zabierz to, co zostawił.',
        reminderLine: 'W jaskini powinien być jego plecak — tam będzie dowód.',
        progressLine: 'To jego rzeczy. Trzeba wrócić z wieścią do rodziny.',
      },
      {
        objective: { type: 'talk_to_npc', npc: { npcId: binding.giverNpcId } },
        description: `Wróć do ${giverName} i opowiedz, co znalazłeś.`,
        reminderLine: `${giverName} czeka na wieści o myśliwym.`,
        playerLine: 'Byłem w jaskini. Znalazłem jego plecak i łuk.',
        progressLine: 'Dziękuję, że to sprawdziłeś. Powiedz, co zrobisz z jego łukiem.',
      },
      {
        objective: { type: 'await_quest_outcome' },
        description: 'Zdecyduj, co zrobić z charakterystycznym łukiem myśliwego.',
        reminderLine: 'Oddaj łuk rodzinie albo zostaw go sobie, ale powiedz prawdę o jego losie.',
        dialogueActions: [
          {
            npc: { npcId: binding.giverNpcId },
            playerLine: 'Zabieram wasz łuk z powrotem — niech zostanie w rodzinie.',
            npcLine: 'Dziękuję. Przynajmniej coś wróciło do domu.',
            physicalOutcomeId: LOST_HUNTER_RETURN_BOW_OUTCOME,
            requireItemInstanceId: binding.bowInstanceId,
          },
          {
            npc: { npcId: binding.giverNpcId },
            playerLine: 'Znalazłem go martwego. Łuk zostaje przy mnie.',
            npcLine: 'Rozumiem… Przynajmniej wiemy, co się stało.',
            physicalOutcomeId: LOST_HUNTER_KEEP_BOW_OUTCOME,
            requireItemInstanceId: binding.bowInstanceId,
          },
        ],
      },
    ],
    reportLine: 'Dziękuję za pomoc w tej trudnej sprawie.',
    outcomes: [
      {
        id: LOST_HUNTER_RETURN_BOW_OUTCOME,
        state: 'complete',
        effects: [{
          type: 'transfer_item_instance',
          instanceId: binding.bowInstanceId,
          toNpc: { npcId: binding.giverNpcId },
        }],
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 4 }] },
        consequences: {
          relations: [{ npc: { npcId: binding.giverNpcId }, delta: 3 }],
          social: {
            reputation: { trust: 5, benevolence: 6, integrity: 3 },
            renown: 4,
          },
        },
      },
      {
        id: LOST_HUNTER_KEEP_BOW_OUTCOME,
        state: 'complete',
        consequences: {
          relations: [{ npc: { npcId: binding.giverNpcId }, delta: 1 }],
          social: {
            reputation: { trust: 1, benevolence: 2 },
            renown: 2,
          },
        },
      },
    ],
    // The bow's return-or-keep choice IS the resolution (plan
    // quests-progression-033) — a generic opt-out here would strand the
    // bound `bowInstanceId` outside any quest tracking.
    abandonment: { allowed: false },
  }
}
