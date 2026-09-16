import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type {
  CaveContentAnchorClaimRequest,
  CaveContentReservationRequests,
} from '../world/caves/caveAdventureContentPolicy'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestDef, QuestDialogueReaction } from './quests'
import { DUNGEON_DEEP_CHAMBER_NODE_ID } from '../world/caves/dungeonTopology'
import { caveWorldLocationId } from '../world/locations/darkForestTreasureSite'
import { adultOpportunityNpcs } from './opportunities/rpgQuestMatrices'

/** Stable reservation-key prefix for dungeon bandit-cache arbitration. */
export const DUNGEON_BANDIT_TREASURE_RESERVATION_PREFIX = 'quests-progression-026'

export const DUNGEON_BANDIT_DEEP_RESERVATION_KEY = `${DUNGEON_BANDIT_TREASURE_RESERVATION_PREFIX}:deep`

export const DUNGEON_BANDIT_QUEST_PREFIX = 'world:dungeon-bandit:'

export const DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME = 'return_marked_property'
export const DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME = 'give_evidence_to_guard'
export const DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME = 'keep_marked_property'

export const DUNGEON_BANDIT_LEDGER_KIND = 'bandit_ledger' as const
export const DUNGEON_BANDIT_MARKED_VALUABLE_KIND = 'marked_valuable' as const

const MAX_SIDE_CACHES = 2

/**
 * Derived world/quest binding — reconstructed on each boot, never persisted.
 *
 * @domain quests-progression
 */
export type DungeonBanditTreasureBinding = {
  questId: string
  settlementId: string
  giverNpcId: NpcId
  claimantNpcId: NpcId
  caveId: string
  caveLocationId: string
  deepLootAnchorId: string
  sideTreasureAnchorIds: readonly string[]
  deepContainerId: string
  sideContainerIds: readonly string[]
  ledgerInstanceId: string
  markedValuableInstanceId: string
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function dungeonBanditDeepReservationKey(): string {
  return DUNGEON_BANDIT_DEEP_RESERVATION_KEY
}

export function dungeonBanditSideReservationKey(anchorId: string): string {
  return `${DUNGEON_BANDIT_TREASURE_RESERVATION_PREFIX}:side:${anchorId}`
}

export function dungeonBanditLedgerInstanceId(caveId: string): string {
  return `quest:bandit-treasure:${caveId}:ledger`
}

export function dungeonBanditMarkedValuableInstanceId(caveId: string): string {
  return `quest:bandit-treasure:${caveId}:valuable`
}

export function dungeonBanditContainerId(anchorId: string): string {
  return `world-container:${DUNGEON_BANDIT_TREASURE_RESERVATION_PREFIX}:${anchorId}`
}

export function dungeonBanditQuestId(
  settlementId: string,
  caveId: string,
  giverNpcId: NpcId,
  claimantNpcId: NpcId,
): string {
  return `${DUNGEON_BANDIT_QUEST_PREFIX}${settlementId}:${caveId}:${giverNpcId}:${claimantNpcId}`
}

export function createDungeonBanditLedgerInstance(caveId: string): ItemInstance {
  return { id: dungeonBanditLedgerInstanceId(caveId), kind: DUNGEON_BANDIT_LEDGER_KIND }
}

export function createDungeonBanditMarkedValuableInstance(caveId: string): ItemInstance {
  return {
    id: dungeonBanditMarkedValuableInstanceId(caveId),
    kind: DUNGEON_BANDIT_MARKED_VALUABLE_KIND,
  }
}

const SIDE_CACHE_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 6,
  bandage: 1,
}

const DEEP_STASH_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 18,
  ruby_small: 1,
  bandage: 2,
}

function isDeepLootAnchor(anchor: CaveContentAnchor): boolean {
  if (anchor.role !== 'loot') return false
  if (anchor.sourceNodeId === DUNGEON_DEEP_CHAMBER_NODE_ID) return true
  return anchor.id === `${anchor.caveId}:loot:${DUNGEON_DEEP_CHAMBER_NODE_ID}`
}

/**
 * Deterministic giver/claimant selection for the dungeon bandit story.
 * Giver prefers guard → hunter → first adult. Claimant prefers a different
 * trader (home first, then nearby settlements), else another adult.
 *
 * @domain quests-progression
 */
export function selectDungeonBanditNpcs(
  homeNpcs: readonly OpportunityNpc[],
  neighborNpcsBySettlement: ReadonlyMap<string, readonly OpportunityNpc[]> = new Map(),
): { giver: OpportunityNpc, claimant: OpportunityNpc } | null {
  const homeAdults = adultOpportunityNpcs(homeNpcs)
  if (homeAdults.length === 0) return null

  const giver = homeAdults.find((npc) => npc.role === 'guard')
    ?? homeAdults.find((npc) => npc.role === 'hunter')
    ?? homeAdults[0]!

  const homeClaimantPool = homeAdults.filter((npc) => npc.id !== giver.id)
  const homeTrader = homeClaimantPool.find((npc) => npc.role === 'trader')
  if (homeTrader) return { giver, claimant: homeTrader }

  const neighborSettlementIds = [...neighborNpcsBySettlement.keys()].sort()
  for (const settlementId of neighborSettlementIds) {
    const adults = adultOpportunityNpcs(neighborNpcsBySettlement.get(settlementId) ?? [])
      .filter((npc) => npc.id !== giver.id)
    const trader = adults.find((npc) => npc.role === 'trader')
    if (trader) return { giver, claimant: trader }
  }

  if (homeClaimantPool[0]) return { giver, claimant: homeClaimantPool[0] }

  for (const settlementId of neighborSettlementIds) {
    const adults = adultOpportunityNpcs(neighborNpcsBySettlement.get(settlementId) ?? [])
      .filter((npc) => npc.id !== giver.id)
    if (adults[0]) return { giver, claimant: adults[0] }
  }

  return null
}

export type EligibleDungeonBanditCave = {
  caveId: string
  deepLootAnchor: CaveContentAnchor
  sideTreasureAnchors: readonly CaveContentAnchor[]
}

/**
 * Lists dungeons that expose a usable deep `loot` anchor. Side caches are
 * optional (up to two `sideTreasure` anchors). Never invents coordinates.
 *
 * @domain quests-progression
 */
export function eligibleDungeonBanditCaves(
  caveIds: readonly string[],
  archetypeOf: (caveId: string) => CaveArchetype | null,
  contentAnchors: readonly CaveContentAnchor[],
  reservedAnchorIds: ReadonlySet<string> = new Set(),
): EligibleDungeonBanditCave[] {
  const eligible: EligibleDungeonBanditCave[] = []
  for (const caveId of [...caveIds].sort()) {
    if (archetypeOf(caveId) !== 'dungeon') continue
    const caveAnchors = contentAnchors.filter((anchor) => anchor.caveId === caveId)
    const deepLootAnchor = caveAnchors.find((anchor) => (
      isDeepLootAnchor(anchor) && !reservedAnchorIds.has(anchor.id)
    ))
    if (!deepLootAnchor) continue
    const sideTreasureAnchors = caveAnchors
      .filter((anchor) => (
        anchor.role === 'sideTreasure'
        && !reservedAnchorIds.has(anchor.id)
      ))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, MAX_SIDE_CACHES)
    eligible.push({ caveId, deepLootAnchor, sideTreasureAnchors })
  }
  return eligible
}

/**
 * Resolves the dungeon bandit binding from stable settlement/cave identity.
 * Emits declarative cave anchor claims; callers must feed them into
 * `resolveCaveAdventureContentPolicy` before container materialization.
 *
 * @domain quests-progression
 */
export function resolveDungeonBanditTreasureBinding(input: {
  worldSeed: number
  settlementId: string
  homeNpcs: readonly OpportunityNpc[]
  neighborNpcsBySettlement?: ReadonlyMap<string, readonly OpportunityNpc[]>
  caveIds: readonly string[]
  archetypeOf: (caveId: string) => CaveArchetype | null
  contentAnchors: readonly CaveContentAnchor[]
  reservedAnchorIds?: ReadonlySet<string>
}): DungeonBanditTreasureBinding | null {
  const npcPick = selectDungeonBanditNpcs(
    input.homeNpcs,
    input.neighborNpcsBySettlement ?? new Map(),
  )
  if (!npcPick) return null
  const eligible = eligibleDungeonBanditCaves(
    input.caveIds,
    input.archetypeOf,
    input.contentAnchors,
    input.reservedAnchorIds ?? new Set(),
  )
  if (eligible.length === 0) return null
  const pick = stableHash(
    `${input.worldSeed}\0${input.settlementId}\0dungeon-bandit-treasure`,
  ) % eligible.length
  const chosen = eligible[pick]!
  const sideTreasureAnchorIds = chosen.sideTreasureAnchors.map((anchor) => anchor.id)
  return {
    questId: dungeonBanditQuestId(
      input.settlementId,
      chosen.caveId,
      npcPick.giver.id,
      npcPick.claimant.id,
    ),
    settlementId: input.settlementId,
    giverNpcId: npcPick.giver.id,
    claimantNpcId: npcPick.claimant.id,
    caveId: chosen.caveId,
    caveLocationId: caveWorldLocationId(chosen.caveId),
    deepLootAnchorId: chosen.deepLootAnchor.id,
    sideTreasureAnchorIds,
    deepContainerId: dungeonBanditContainerId(chosen.deepLootAnchor.id),
    sideContainerIds: sideTreasureAnchorIds.map(dungeonBanditContainerId),
    ledgerInstanceId: dungeonBanditLedgerInstanceId(chosen.caveId),
    markedValuableInstanceId: dungeonBanditMarkedValuableInstanceId(chosen.caveId),
  }
}

export function dungeonBanditAnchorClaims(
  binding: DungeonBanditTreasureBinding,
): readonly CaveContentAnchorClaimRequest[] {
  return [
    {
      reservationKey: dungeonBanditDeepReservationKey(),
      anchorId: binding.deepLootAnchorId,
    },
    ...binding.sideTreasureAnchorIds.map((anchorId) => ({
      reservationKey: dungeonBanditSideReservationKey(anchorId),
      anchorId,
    })),
  ]
}

export function dungeonBanditCaveReservationRequests(
  binding: DungeonBanditTreasureBinding,
): CaveContentReservationRequests {
  return { anchorClaims: dungeonBanditAnchorClaims(binding) }
}

/**
 * True when every expected reservation key resolved to the binding's anchors.
 *
 * @domain quests-progression
 */
export function dungeonBanditClaimsMatch(
  binding: DungeonBanditTreasureBinding,
  claimOf: (reservationKey: string) => { anchorId: string, caveId: string } | undefined,
): boolean {
  const deep = claimOf(dungeonBanditDeepReservationKey())
  if (!deep || deep.anchorId !== binding.deepLootAnchorId || deep.caveId !== binding.caveId) {
    return false
  }
  for (const anchorId of binding.sideTreasureAnchorIds) {
    const side = claimOf(dungeonBanditSideReservationKey(anchorId))
    if (!side || side.anchorId !== anchorId || side.caveId !== binding.caveId) return false
  }
  return true
}

/**
 * World-generated side caches at claimed dungeon `sideTreasure` anchors.
 * Ordinary loot only; exists before quest acceptance.
 *
 * @domain quests-progression
 */
export function dungeonBanditSideCacheContainerSpecs(
  binding: DungeonBanditTreasureBinding,
  contentAnchors: readonly CaveContentAnchor[],
): WorldGeneratedContainerSpec[] {
  const byId = new Map(contentAnchors.map((anchor) => [anchor.id, anchor]))
  const specs: WorldGeneratedContainerSpec[] = []
  for (let i = 0; i < binding.sideTreasureAnchorIds.length; i++) {
    const anchorId = binding.sideTreasureAnchorIds[i]!
    const containerId = binding.sideContainerIds[i]!
    const anchor = byId.get(anchorId)
    if (!anchor) continue
    specs.push({
      id: containerId,
      kind: 'chest',
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
      yaw: anchor.yaw,
      initialCounts: SIDE_CACHE_SUPPLY,
      spatialContext: { kind: 'cave', caveId: binding.caveId },
    })
  }
  return specs
}

/**
 * World-generated deep stash at the claimed dungeon deep `loot` anchor.
 * Ordinary loot plus ledger + marked valuable instances.
 *
 * @domain quests-progression
 */
export function dungeonBanditDeepStashContainerSpec(
  binding: DungeonBanditTreasureBinding,
  deepLootAnchor: CaveContentAnchor,
): WorldGeneratedContainerSpec {
  return {
    id: binding.deepContainerId,
    kind: 'chest',
    x: deepLootAnchor.x,
    y: deepLootAnchor.y,
    z: deepLootAnchor.z,
    yaw: deepLootAnchor.yaw,
    initialCounts: DEEP_STASH_SUPPLY,
    initialInstances: [
      createDungeonBanditLedgerInstance(binding.caveId),
      createDungeonBanditMarkedValuableInstance(binding.caveId),
    ],
    spatialContext: { kind: 'cave', caveId: binding.caveId },
  }
}

export function dungeonBanditContainerSpecs(
  binding: DungeonBanditTreasureBinding,
  contentAnchors: readonly CaveContentAnchor[],
): WorldGeneratedContainerSpec[] {
  const deepAnchor = contentAnchors.find((anchor) => anchor.id === binding.deepLootAnchorId)
  if (!deepAnchor) return []
  return [
    ...dungeonBanditSideCacheContainerSpecs(binding, contentAnchors),
    dungeonBanditDeepStashContainerSpec(binding, deepAnchor),
  ]
}

export function isDungeonBanditDeepStashLooted(
  instances: readonly { id: string }[],
  markedValuableInstanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === markedValuableInstanceId)
}

/**
 * Materializes the dungeon bandit-treasure quest for one resolved binding.
 *
 * @domain quests-progression
 */
export function buildDungeonBanditTreasureQuest(
  binding: DungeonBanditTreasureBinding,
  npcs: readonly OpportunityNpc[],
  settlementName: string,
  caveDescription: string,
): QuestDef {
  const giver = npcs.find((npc) => npc.id === binding.giverNpcId)
  const claimant = npcs.find((npc) => npc.id === binding.claimantNpcId)
  const giverName = giver?.name ?? 'Strażnik'
  const claimantName = claimant?.name ?? 'Kupiec'
  const returnWarmth: QuestDialogueReaction = {
    when: [{ type: 'relation', npc: { npcId: binding.claimantNpcId }, minimum: 'friendly' }],
    npcLine: 'Poznałem go od razu. Dobrze, że trafił właśnie do ciebie.',
    consequences: { relations: [{ npc: { npcId: binding.claimantNpcId }, delta: 1 }] },
  }
  const evidenceProfessionalLine = 'Dobrze to rozegrałeś. Zostaw rejestr i klejnot — zajmę się resztą.'
  const giveEvidenceRecognition: readonly QuestDialogueReaction[] = [
    {
      when: [{ type: 'reputation', dimension: 'competence', minimum: 5 }],
      npcLine: evidenceProfessionalLine,
    },
    {
      when: [{ type: 'reputation', dimension: 'integrity', minimum: 5 }],
      npcLine: evidenceProfessionalLine,
    },
  ]
  const keepMarkedInterpretation: readonly QuestDialogueReaction[] = [
    {
      when: [{ type: 'reputation', dimension: 'integrity', minimum: 5 }],
      npcLine: 'Naprawdę chcesz zatrzymać rzecz z cudzym znakiem?',
    },
    {
      when: [{ type: 'reputation', dimension: 'integrity', maximum: 0 }],
      npcLine: 'No tak. Czyli jednak po klejnot tam poszedłeś.',
    },
  ]

  return {
    id: binding.questId,
    title: 'Skrytka bandytów',
    description:
      `${giverName} z osady ${settlementName} zna starą bandycką kryjówkę w lochu. `
      + `Głęboka skrytka kryje rejestr napadów i oznaczony łup — ${claimantName} może być właścicielem.`,
    giverName,
    giver: { npcId: binding.giverNpcId },
    settlementId: binding.settlementId,
    offerLine:
      `Znam starą bandycką kryjówkę. To ${caveDescription}. Jeśli ktoś kiedyś ukradł coś oznaczonego — rejestr wskaże właściciela.`,
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: { npcId: binding.giverNpcId } },
        description: `Wysłuchaj ${giverName} — wie o historycznej bandyckiej kryjówce.`,
        reminderLine: `${giverName} wskazał loch ze starą skrytką.`,
        playerLine: 'Słyszałem, że znasz starą bandycką kryjówkę.',
        progressLine:
          `Bandycka kryjówka znajduje się tutaj: ${caveDescription}. Weź rejestr i oznaczony łup — potem zdecyduj, co z nimi zrobić.`,
        effects: [{
          type: 'reveal_location',
          locationId: binding.caveLocationId,
          setNavigation: true,
        }],
      },
      {
        objective: { type: 'loot_world_container', containerId: binding.deepContainerId },
        description: 'Odnajdź głęboką skrytkę w lochu i zabierz oznaczony łup oraz rejestr.',
        reminderLine: 'Głęboka skrytka w lochu powinna kryć rejestr i oznaczony klejnot.',
        progressLine:
          `Rejestr wskazuje ${claimantName} jako właściciela oznaczonego łupu. Czas zdecydować.`,
      },
      {
        objective: { type: 'await_quest_outcome' },
        description:
          `Zdecyduj: oddaj oznaczony łup ${claimantName}, przekaż dowody ${giverName}, albo zatrzymaj łup.`,
        reminderLine: 'Oznaczony łup i rejestr wciąż wymagają decyzji.',
        dialogueActions: [
          {
            npc: { npcId: binding.claimantNpcId },
            playerLine: `Oddaję ci ten oznaczony klejnot, ${claimantName}. Rejestr potwierdza, że to twój.`,
            npcLine: 'Dziękuję. Przynajmniej coś z tamtego napadu wraca do domu.',
            physicalOutcomeId: DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
            requireItemInstanceId: binding.markedValuableInstanceId,
            reactions: [returnWarmth],
          },
          {
            npc: { npcId: binding.giverNpcId },
            playerLine: `Przekazuję rejestr i oznaczony łup tobie, ${giverName}. Niech formalnie wrócą do właściciela.`,
            npcLine: 'Zostaw wszystko tutaj. Sprawdzę rejestr i właściciela.',
            physicalOutcomeId: DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
            requireItemInstanceId: binding.markedValuableInstanceId,
            reactions: [...giveEvidenceRecognition],
          },
          {
            npc: { npcId: binding.giverNpcId },
            playerLine: 'Znalazłem skrytkę, ale oznaczony łup zostaje przy mnie.',
            npcLine: 'Więc bierzesz cudzą rzecz i chowasz dowody. Zapamiętam.',
            physicalOutcomeId: DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
            requireItemInstanceId: binding.markedValuableInstanceId,
            reactions: [...keepMarkedInterpretation],
          },
        ],
      },
    ],
    reportLine: 'Sprawa starej bandyckiej skrytki jest zamknięta.',
    outcomes: [
      {
        id: DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME,
        state: 'complete',
        resultText: 'Oznaczony łup wrócił do właściciela. Zwykły bandycki łup zostaje przy tobie.',
        consequences: {
          relations: [{ npc: { npcId: binding.claimantNpcId }, delta: 3 }],
          social: {
            reputation: { trust: 4, integrity: 5, benevolence: 4 },
            renown: 2,
          },
        },
      },
      {
        id: DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME,
        state: 'complete',
        resultText: 'Rejestr i oznaczony łup trafiły do straży w celu formalnego zwrotu.',
        consequences: {
          relations: [{ npc: { npcId: binding.claimantNpcId }, delta: 1 }],
          social: {
            reputation: { competence: 5, integrity: 4 },
            renown: 4,
          },
        },
      },
      {
        id: DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME,
        state: 'complete',
        resultText: 'Oznaczony łup został przy tobie. Dowodów nie oddano.',
        consequences: {
          relations: [{ npc: { npcId: binding.claimantNpcId }, delta: -2 }],
          social: {
            reputation: { trust: -2, integrity: -4 },
            renown: 1,
          },
        },
      },
    ],
    // Carried ledger/valuable return/guard/keep choice IS the resolution —
    // a generic opt-out would strand those instances outside quest tracking.
    abandonment: { allowed: false },
  }
}
