import type { WeaponItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestDef, QuestDialogueReaction } from './quests'
import { CaveAuthoredAnchorClaims } from '../world/caves/caveAuthoredAnchorClaims'
import { caveWorldLocationId } from '../world/locations/darkForestTreasureSite'
import {
  pickSuspiciousTransportNpcs,
  rpgQuestId,
} from './opportunities/rpgQuestMatrices'

/** Stable reservation key — must claim after `quests-progression-023`. */
export const SUSPICIOUS_TRANSPORT_CAVE_CACHE_RESERVATION_KEY = 'quests-progression-024'

export const SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME = 'keep_quiet'
export const SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME = 'report_it'
export const SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME = 'keep_goods'

export const SUSPICIOUS_TRANSPORT_EVIDENCE_KIND = 'damascus_knife' as const

/**
 * Derived world/quest binding — reconstructed on each boot, never persisted.
 *
 * @domain quests-progression
 */
export type SuspiciousTransportCaveCacheBinding = {
  questId: string
  settlementId: string
  giverNpcId: NpcId
  counterpartNpcId: NpcId
  caveId: string
  caveLocationId: string
  lootAnchorId: string
  cacheContainerId: string
  evidenceInstanceId: string
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function suspiciousTransportEvidenceInstanceId(caveId: string): string {
  return `quest:suspicious-transport:${caveId}:damascus_knife`
}

export function suspiciousTransportCacheContainerId(lootAnchorId: string): string {
  return `world-container:quests-progression-024:${lootAnchorId}`
}

export function createSuspiciousTransportEvidenceInstance(caveId: string): WeaponItemInstance {
  return {
    id: suspiciousTransportEvidenceInstanceId(caveId),
    kind: SUSPICIOUS_TRANSPORT_EVIDENCE_KIND,
    durability: 1,
    sharpness: 1,
  }
}

const CACHE_GOODS: Partial<Record<ItemKind, number>> = {
  iron_rod: 2,
  bandage: 1,
}

function eligibleNaturalLootAnchors(
  caveIds: readonly string[],
  archetypeOf: (caveId: string) => CaveArchetype | null,
  contentAnchors: readonly CaveContentAnchor[],
  claims: CaveAuthoredAnchorClaims,
): { caveId: string, lootAnchorId: string }[] {
  const eligible: { caveId: string, lootAnchorId: string }[] = []
  for (const caveId of caveIds) {
    if (archetypeOf(caveId) !== 'natural') continue
    const loot = contentAnchors.find((anchor) => anchor.caveId === caveId && anchor.role === 'loot')
    if (!loot) continue
    if (claims.isClaimed(loot.id)) continue
    eligible.push({ caveId, lootAnchorId: loot.id })
  }
  return eligible.sort((a, b) => a.caveId.localeCompare(b.caveId))
}

/**
 * Binds the existing `suspicious-transport` matrix to one unclaimed natural
 * `loot` anchor. Claim order is reservation-key stable: 023 then 024.
 *
 * @domain quests-progression
 */
export function resolveSuspiciousTransportCaveCacheBinding(input: {
  worldSeed: number
  settlementId: string
  npcs: readonly OpportunityNpc[]
  caveIds: readonly string[]
  archetypeOf: (caveId: string) => CaveArchetype | null
  contentAnchors: readonly CaveContentAnchor[]
  claims: CaveAuthoredAnchorClaims
}): SuspiciousTransportCaveCacheBinding | null {
  const roles = pickSuspiciousTransportNpcs(input.npcs)
  if (!roles) return null
  const eligible = eligibleNaturalLootAnchors(
    input.caveIds,
    input.archetypeOf,
    input.contentAnchors,
    input.claims,
  )
  if (eligible.length === 0) return null
  const pick = stableHash(
    `${input.worldSeed}\0${input.settlementId}\0suspicious-transport-cave`,
  ) % eligible.length
  const chosen = eligible[pick]!
  if (!input.claims.tryClaimAnchor(chosen.lootAnchorId)) return null
  const questId = rpgQuestId('suspicious-transport', input.settlementId, roles.counterpart.id)
  return {
    questId,
    settlementId: input.settlementId,
    giverNpcId: roles.giver.id,
    counterpartNpcId: roles.counterpart.id,
    caveId: chosen.caveId,
    caveLocationId: caveWorldLocationId(chosen.caveId),
    lootAnchorId: chosen.lootAnchorId,
    cacheContainerId: suspiciousTransportCacheContainerId(chosen.lootAnchorId),
    evidenceInstanceId: suspiciousTransportEvidenceInstanceId(chosen.caveId),
  }
}

/**
 * World-generated cache at the bound natural `loot` anchor. Materialized
 * regardless of quest offer/acceptance.
 *
 * @domain quests-progression
 */
export function suspiciousTransportCacheContainerSpec(
  binding: SuspiciousTransportCaveCacheBinding,
  lootAnchor: CaveContentAnchor,
): WorldGeneratedContainerSpec {
  return {
    id: binding.cacheContainerId,
    kind: 'chest',
    x: lootAnchor.x,
    y: lootAnchor.y,
    z: lootAnchor.z,
    yaw: lootAnchor.yaw,
    initialCounts: CACHE_GOODS,
    initialInstances: [createSuspiciousTransportEvidenceInstance(binding.caveId)],
    spatialContext: { kind: 'cave', caveId: binding.caveId },
  }
}

export function isSuspiciousTransportCacheLooted(
  instances: readonly { id: string }[],
  evidenceInstanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === evidenceInstanceId)
}

/**
 * Cave-cache variant of the existing `suspicious-transport` matrix. Same
 * quest id; physical reveal/loot/hand-in instead of dialogue-only choice.
 *
 * @domain quests-progression
 */
export function buildSuspiciousTransportCaveCacheQuest(
  binding: SuspiciousTransportCaveCacheBinding,
  giver: OpportunityNpc,
  counterpart: OpportunityNpc,
  settlementName: string,
  caveDescription: string,
): QuestDef {
  const keepGoodsBase = {
    physicalOutcomeId: SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME,
    requireItemInstanceId: binding.evidenceInstanceId,
    playerLine: 'Nie oddam tego. Zostaje u mnie.',
    npcLine: 'Czyli po to po nią poszedłeś. Dobrze wiedzieć.',
  }
  const keepQuietWarmth: QuestDialogueReaction = {
    when: [{ type: 'relation', npc: { npcId: giver.id }, minimum: 'friendly' }],
    npcLine: 'Dobrze. Oddaj ją i zostawmy tę sprawę tutaj.',
    consequences: { relations: [{ npc: { npcId: giver.id }, delta: 1 }] },
  }
  const reportBetrayal: QuestDialogueReaction = {
    when: [{ type: 'relation', npc: { npcId: giver.id }, minimum: 'friendly' }],
    consequences: { relations: [{ npc: { npcId: giver.id }, delta: -2 }] },
  }
  const keepGoodsGiverBetrayal: QuestDialogueReaction = {
    when: [{ type: 'relation', npc: { npcId: giver.id }, minimum: 'trusted' }],
    npcLine: 'Tobie właśnie dałem tę robotę, bo nie chciałem świadków.',
    consequences: { relations: [{ npc: { npcId: giver.id }, delta: -2 }] },
  }
  const keepGoodsCounterpartSurprise: QuestDialogueReaction = {
    when: [{ type: 'reputation', dimension: 'integrity', minimum: 5 }],
    npcLine: 'Po to ją znalazłeś? Tego się po tobie nie spodziewałem.',
  }
  return {
    id: binding.questId,
    title: 'Podejrzany transport',
    description:
      `${giver.name} z osady ${settlementName} prosi, żeby przynieść paczkę zostawioną poza osadą. ${counterpart.name} chce ją zobaczyć.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      'Potrzebuję drobnej przysługi. Czeka na mnie paczka poza osadą. Przynieś ją prosto do mnie.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: { npcId: giver.id } },
        description: `Wysłuchaj ${giver.name} — wskaże dokładny schowek.`,
        reminderLine: `${giver.name} wie, gdzie leży schowek.`,
        playerLine: 'Gdzie ją zostawiono?',
        progressLine:
          `Tutaj: ${caveDescription}. Weź paczkę i wróć z nią do mnie.`,
        effects: [{
          type: 'reveal_location',
          locationId: binding.caveLocationId,
          setNavigation: true,
        }],
      },
      {
        objective: { type: 'loot_world_container', containerId: binding.cacheContainerId },
        description: 'Odnajdź schowek we wskazanej jaskini i zabierz przesyłkę.',
        reminderLine: 'Schowek jest we wskazanej jaskini — zabierz przesyłkę, zanim ktoś inny to zrobi.',
        progressLine: 'Paczka jest u ciebie. Teraz wróć z nią do osady.',
      },
      {
        objective: { type: 'await_quest_outcome' },
        description: `Zdecyduj, czy oddajesz przesyłkę ${giver.name}, zgłaszasz ją ${counterpart.name}, czy zostawiasz charakterystyczny przedmiot sobie.`,
        reminderLine: 'Zdecydowałeś już, komu oddać tę przesyłkę, czy zatrzymać ją sobie?',
        dialogueActions: [
          {
            npc: { npcId: giver.id },
            physicalOutcomeId: SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME,
            requireItemInstanceId: binding.evidenceInstanceId,
            playerLine: 'Masz swoją paczkę. Zostawmy to między nami.',
            npcLine: 'Dobrze. Im mniej osób o niej gada, tym lepiej.',
            reactions: [keepQuietWarmth],
          },
          {
            npc: { npcId: counterpart.id },
            physicalOutcomeId: SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME,
            requireItemInstanceId: binding.evidenceInstanceId,
            playerLine: 'Znalazłem przesyłkę. Wolę, żebyś ty ją zobaczył.',
            npcLine: 'Połóż ją tutaj. Sprawdzimy, co właściwie trafiło do osady.',
            reactions: [reportBetrayal],
          },
          {
            npc: { npcId: giver.id },
            ...keepGoodsBase,
            reactions: [keepGoodsGiverBetrayal],
          },
          {
            npc: { npcId: counterpart.id },
            ...keepGoodsBase,
            reactions: [keepGoodsCounterpartSurprise],
          },
        ],
      },
    ],
    reportLine: 'Ta przesyłka już nie leży w schowku.',
    settlementId: binding.settlementId,
    outcomes: [
      {
        id: SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME,
        state: 'complete',
        resultText: 'Dobrze. Im mniej osób o niej gada, tym lepiej.',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 8 }] },
        consequences: {
          relations: [
            { npc: { npcId: giver.id }, delta: 2 },
            { npc: { npcId: counterpart.id }, delta: -1 },
          ],
          social: { reputation: { trust: 1, integrity: -1 }, renown: 1 },
        },
      },
      {
        id: SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME,
        state: 'complete',
        resultText: 'Połóż ją tutaj. Sprawdzimy, co właściwie trafiło do osady.',
        consequences: {
          relations: [
            { npc: { npcId: counterpart.id }, delta: 2 },
            { npc: { npcId: giver.id }, delta: -1 },
          ],
          social: { reputation: { integrity: 4, courage: 2 }, renown: 2 },
        },
      },
      {
        id: SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME,
        state: 'complete',
        resultText: 'Czyli po to po nią poszedłeś. Dobrze wiedzieć.',
        consequences: {
          relations: [
            { npc: { npcId: giver.id }, delta: -1 },
            { npc: { npcId: counterpart.id }, delta: -1 },
          ],
          social: { reputation: { trust: -2, integrity: -2 }, renown: 1 },
        },
      },
    ],
    // The carried evidence instance's own keep/report/stay-quiet choice IS
    // the resolution (plan quests-progression-033) — a generic opt-out here
    // would strand that carried instance outside any quest tracking.
    abandonment: { allowed: false },
  }
}
