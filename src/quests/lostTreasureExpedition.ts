import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type {
  CaveContentAnchorClaimRequest,
  CaveContentReservationRequests,
} from '../world/caves/caveAdventureContentPolicy'
import type { CaveArchetype } from '../world/caves/caveArchetype'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { DungeonChamber } from '../world/caves/dungeonChambers'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestDef } from './quests'
import { caveWorldLocationId } from '../world/locations/darkForestTreasureSite'

/** Stable reservation-key prefix for lost-treasure-expedition anchor arbitration. */
export const LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX = 'quests-progression-027'

export const LOST_TREASURE_EXPEDITION_CAMP_RESERVATION_KEY = `${LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX}:camp`
export const LOST_TREASURE_EXPEDITION_JOURNAL_RESERVATION_KEY = `${LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX}:journal`
export const LOST_TREASURE_EXPEDITION_EVIDENCE_RESERVATION_KEY = `${LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX}:evidence`
export const LOST_TREASURE_EXPEDITION_FINAL_RESERVATION_KEY = `${LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX}:final`

export const LOST_TREASURE_EXPEDITION_QUEST_PREFIX = 'world:lost-treasure-expedition:'

export const LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME = 'journal_to_family'
export const LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME = 'journal_to_sponsor'
export const LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME = 'keep_journal_and_treasure'

export const LOST_TREASURE_EXPEDITION_JOURNAL_KIND = 'expedition_journal' as const

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Derived world/quest binding — reconstructed on each boot, never persisted.
 *
 * @domain quests-progression
 */
export type LostTreasureExpeditionBinding = {
  questId: string
  settlementId: string
  sponsorNpcId: NpcId
  stakeholderNpcId?: NpcId
  caveId: string
  caveLocationId: string
  campAnchorId: string
  journalAnchorId: string
  evidenceAnchorId: string
  finalTreasureAnchorId: string
  campContainerId: string
  journalContainerId: string
  evidenceContainerId: string
  finalTreasureContainerId: string
  journalInstanceId: string
}

export function lostTreasureExpeditionContainerId(anchorId: string): string {
  return `world-container:${LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX}:${anchorId}`
}

export function lostTreasureExpeditionJournalInstanceId(caveId: string): string {
  return `quest:lost-treasure-expedition:${caveId}:journal`
}

export function lostTreasureExpeditionQuestId(
  settlementId: string,
  caveId: string,
  sponsorNpcId: NpcId,
  stakeholderNpcId?: NpcId,
): string {
  const suffix = stakeholderNpcId ? `:${sponsorNpcId}:${stakeholderNpcId}` : `:${sponsorNpcId}`
  return `${LOST_TREASURE_EXPEDITION_QUEST_PREFIX}${settlementId}:${caveId}${suffix}`
}

export function createLostTreasureExpeditionJournalInstance(caveId: string): ItemInstance {
  return { id: lostTreasureExpeditionJournalInstanceId(caveId), kind: LOST_TREASURE_EXPEDITION_JOURNAL_KIND }
}

const CAMP_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 4,
  bandage: 1,
}

const JOURNAL_PACK_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 6,
}

const EVIDENCE_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 8,
  bandage: 1,
}

const FINAL_TREASURE_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 50,
  ruby_medium: 1,
}

function adults(npcs: readonly SettlementOpportunityNpc[]): SettlementOpportunityNpc[] {
  return npcs.filter((npc) => !npc.child)
}

/**
 * Deterministic sponsor/stakeholder selection for the lost-treasure-expedition
 * story. Sponsor prefers trader → miner → first adult. The second stakeholder
 * must be an adult from a different household (home first, then the nearest
 * neighbor settlement that has one) — never invented.
 *
 * @domain quests-progression
 */
export function selectLostTreasureExpeditionNpcs(
  homeNpcs: readonly SettlementOpportunityNpc[],
  neighborNpcsBySettlement: ReadonlyMap<string, readonly SettlementOpportunityNpc[]> = new Map(),
): { sponsor: SettlementOpportunityNpc, stakeholder?: SettlementOpportunityNpc } | null {
  const homeAdults = adults(homeNpcs)
  if (homeAdults.length === 0) return null

  const sponsor = homeAdults.find((npc) => npc.role === 'trader')
    ?? homeAdults.find((npc) => npc.role === 'miner')
    ?? homeAdults[0]!

  const homeStakeholderPool = homeAdults
    .filter((npc) => npc.id !== sponsor.id && npc.householdId !== sponsor.householdId)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (homeStakeholderPool[0]) return { sponsor, stakeholder: homeStakeholderPool[0] }

  const neighborSettlementIds = [...neighborNpcsBySettlement.keys()].sort()
  for (const settlementId of neighborSettlementIds) {
    const pool = adults(neighborNpcsBySettlement.get(settlementId) ?? [])
      .sort((a, b) => a.id.localeCompare(b.id))
    if (pool[0]) return { sponsor, stakeholder: pool[0] }
  }

  return { sponsor }
}

export type EligibleLostTreasureExpeditionCave = {
  caveId: string
  campAnchor: CaveContentAnchor
  journalAnchor: CaveContentAnchor
  evidenceAnchor: CaveContentAnchor
  finalTreasureAnchor: CaveContentAnchor
}

/**
 * Orders a dungeon's `storyFind` anchors from shallower to deeper progression
 * using `Caves.dungeonChambersOf()`'s own stable route order — never array
 * position or raw topology-node Y.
 *
 * @domain quests-progression
 */
function orderedStoryFindTrail(
  caveId: string,
  dungeonChambersOf: (caveId: string) => readonly DungeonChamber[],
  contentAnchors: readonly CaveContentAnchor[],
  reservedAnchorIds: ReadonlySet<string>,
): CaveContentAnchor[] {
  const chambers = dungeonChambersOf(caveId).filter((chamber) => (
    chamber.class === 'regular' || chamber.class === 'deep' || chamber.class === 'final'
  ))
  const caveAnchors = contentAnchors.filter((anchor) => anchor.caveId === caveId)
  const trail: CaveContentAnchor[] = []
  for (const chamber of chambers) {
    const anchor = caveAnchors.find((candidate) => (
      candidate.role === 'storyFind'
      && candidate.sourceNodeId === chamber.nodeId
      && !reservedAnchorIds.has(candidate.id)
    ))
    if (anchor) trail.push(anchor)
  }
  return trail
}

/**
 * Lists dungeons exposing an ordered `storyFind` trail (early camp, leader
 * pack, final evidence) plus an unclaimed `finalTreasure` anchor. Never
 * synthesizes a missing anchor — a dungeon short of either is ineligible.
 *
 * @domain quests-progression
 */
export function eligibleLostTreasureExpeditionCaves(
  caveIds: readonly string[],
  archetypeOf: (caveId: string) => CaveArchetype | null,
  dungeonChambersOf: (caveId: string) => readonly DungeonChamber[],
  contentAnchors: readonly CaveContentAnchor[],
  reservedAnchorIds: ReadonlySet<string> = new Set(),
): EligibleLostTreasureExpeditionCave[] {
  const eligible: EligibleLostTreasureExpeditionCave[] = []
  for (const caveId of [...caveIds].sort()) {
    if (archetypeOf(caveId) !== 'dungeon') continue
    const trail = orderedStoryFindTrail(caveId, dungeonChambersOf, contentAnchors, reservedAnchorIds)
    if (trail.length < 3) continue
    const finalTreasureAnchor = contentAnchors.find((anchor) => (
      anchor.caveId === caveId && anchor.role === 'finalTreasure' && !reservedAnchorIds.has(anchor.id)
    ))
    if (!finalTreasureAnchor) continue
    eligible.push({
      caveId,
      campAnchor: trail[0]!,
      journalAnchor: trail[1]!,
      evidenceAnchor: trail[trail.length - 1]!,
      finalTreasureAnchor,
    })
  }
  return eligible
}

/**
 * Resolves the lost-treasure-expedition binding from stable settlement/cave
 * identity. Emits declarative cave anchor claims; callers must feed them into
 * `resolveCaveAdventureContentPolicy` before container materialization.
 *
 * @domain quests-progression
 */
export function resolveLostTreasureExpeditionBinding(input: {
  worldSeed: number
  settlementId: string
  homeNpcs: readonly SettlementOpportunityNpc[]
  neighborNpcsBySettlement?: ReadonlyMap<string, readonly SettlementOpportunityNpc[]>
  caveIds: readonly string[]
  archetypeOf: (caveId: string) => CaveArchetype | null
  dungeonChambersOf: (caveId: string) => readonly DungeonChamber[]
  contentAnchors: readonly CaveContentAnchor[]
  reservedAnchorIds?: ReadonlySet<string>
}): LostTreasureExpeditionBinding | null {
  const npcPick = selectLostTreasureExpeditionNpcs(
    input.homeNpcs,
    input.neighborNpcsBySettlement ?? new Map(),
  )
  if (!npcPick) return null
  const eligible = eligibleLostTreasureExpeditionCaves(
    input.caveIds,
    input.archetypeOf,
    input.dungeonChambersOf,
    input.contentAnchors,
    input.reservedAnchorIds ?? new Set(),
  )
  if (eligible.length === 0) return null
  const pick = stableHash(
    `${input.worldSeed}\0${input.settlementId}\0lost-treasure-expedition`,
  ) % eligible.length
  const chosen = eligible[pick]!
  return {
    questId: lostTreasureExpeditionQuestId(
      input.settlementId,
      chosen.caveId,
      npcPick.sponsor.id,
      npcPick.stakeholder?.id,
    ),
    settlementId: input.settlementId,
    sponsorNpcId: npcPick.sponsor.id,
    ...(npcPick.stakeholder ? { stakeholderNpcId: npcPick.stakeholder.id } : {}),
    caveId: chosen.caveId,
    caveLocationId: caveWorldLocationId(chosen.caveId),
    campAnchorId: chosen.campAnchor.id,
    journalAnchorId: chosen.journalAnchor.id,
    evidenceAnchorId: chosen.evidenceAnchor.id,
    finalTreasureAnchorId: chosen.finalTreasureAnchor.id,
    campContainerId: lostTreasureExpeditionContainerId(chosen.campAnchor.id),
    journalContainerId: lostTreasureExpeditionContainerId(chosen.journalAnchor.id),
    evidenceContainerId: lostTreasureExpeditionContainerId(chosen.evidenceAnchor.id),
    finalTreasureContainerId: lostTreasureExpeditionContainerId(chosen.finalTreasureAnchor.id),
    journalInstanceId: lostTreasureExpeditionJournalInstanceId(chosen.caveId),
  }
}

export function lostTreasureExpeditionAnchorClaims(
  binding: LostTreasureExpeditionBinding,
): readonly CaveContentAnchorClaimRequest[] {
  return [
    { reservationKey: LOST_TREASURE_EXPEDITION_CAMP_RESERVATION_KEY, anchorId: binding.campAnchorId },
    { reservationKey: LOST_TREASURE_EXPEDITION_JOURNAL_RESERVATION_KEY, anchorId: binding.journalAnchorId },
    { reservationKey: LOST_TREASURE_EXPEDITION_EVIDENCE_RESERVATION_KEY, anchorId: binding.evidenceAnchorId },
    { reservationKey: LOST_TREASURE_EXPEDITION_FINAL_RESERVATION_KEY, anchorId: binding.finalTreasureAnchorId },
  ]
}

export function lostTreasureExpeditionCaveReservationRequests(
  binding: LostTreasureExpeditionBinding,
): CaveContentReservationRequests {
  return { anchorClaims: lostTreasureExpeditionAnchorClaims(binding) }
}

/**
 * True when every expected reservation key resolved to the binding's anchors.
 *
 * @domain quests-progression
 */
export function lostTreasureExpeditionClaimsMatch(
  binding: LostTreasureExpeditionBinding,
  claimOf: (reservationKey: string) => { anchorId: string, caveId: string } | undefined,
): boolean {
  for (const claim of lostTreasureExpeditionAnchorClaims(binding)) {
    const resolved = claimOf(claim.reservationKey)
    if (!resolved || resolved.anchorId !== claim.anchorId || resolved.caveId !== binding.caveId) return false
  }
  return true
}

function anchorContainerSpec(
  containerId: string,
  anchor: CaveContentAnchor,
  caveId: string,
  initialCounts: Partial<Record<ItemKind, number>>,
  initialInstances?: readonly ItemInstance[],
): WorldGeneratedContainerSpec {
  return {
    id: containerId,
    kind: 'chest',
    x: anchor.x,
    y: anchor.y,
    z: anchor.z,
    yaw: anchor.yaw,
    initialCounts,
    ...(initialInstances ? { initialInstances } : {}),
    spatialContext: { kind: 'cave', caveId },
  }
}

/**
 * World-generated expedition content at the claimed dungeon `storyFind` /
 * `finalTreasure` anchors. Ordinary loot plus the journal instance in the
 * leader-pack container; exists before quest acceptance.
 *
 * @domain quests-progression
 */
export function lostTreasureExpeditionContainerSpecs(
  binding: LostTreasureExpeditionBinding,
  contentAnchors: readonly CaveContentAnchor[],
): WorldGeneratedContainerSpec[] {
  const byId = new Map(contentAnchors.map((anchor) => [anchor.id, anchor]))
  const camp = byId.get(binding.campAnchorId)
  const journal = byId.get(binding.journalAnchorId)
  const evidence = byId.get(binding.evidenceAnchorId)
  const finalTreasure = byId.get(binding.finalTreasureAnchorId)
  if (!camp || !journal || !evidence || !finalTreasure) return []
  return [
    anchorContainerSpec(binding.campContainerId, camp, binding.caveId, CAMP_SUPPLY),
    anchorContainerSpec(binding.journalContainerId, journal, binding.caveId, JOURNAL_PACK_SUPPLY, [
      createLostTreasureExpeditionJournalInstance(binding.caveId),
    ]),
    anchorContainerSpec(binding.evidenceContainerId, evidence, binding.caveId, EVIDENCE_SUPPLY),
    anchorContainerSpec(binding.finalTreasureContainerId, finalTreasure, binding.caveId, FINAL_TREASURE_SUPPLY),
  ]
}

export function isLostTreasureExpeditionJournalPackLooted(
  instances: readonly { id: string }[],
  journalInstanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === journalInstanceId)
}

function suppliesLooted(
  counts: Partial<Record<string, number>>,
  supply: Partial<Record<ItemKind, number>>,
): boolean {
  return (Object.keys(supply) as ItemKind[]).every((kind) => (counts[kind] ?? 0) === 0)
}

export function isLostTreasureExpeditionCampLooted(counts: Partial<Record<string, number>>): boolean {
  return suppliesLooted(counts, CAMP_SUPPLY)
}

export function isLostTreasureExpeditionEvidenceLooted(counts: Partial<Record<string, number>>): boolean {
  return suppliesLooted(counts, EVIDENCE_SUPPLY)
}

export function isLostTreasureExpeditionFinalTreasureLooted(counts: Partial<Record<string, number>>): boolean {
  return suppliesLooted(counts, FINAL_TREASURE_SUPPLY)
}

/**
 * Materializes the lost-treasure-expedition quest for one resolved binding.
 *
 * @domain quests-progression
 */
export function buildLostTreasureExpeditionQuest(
  binding: LostTreasureExpeditionBinding,
  npcs: readonly OpportunityNpc[],
  settlementName: string,
  caveDescription: string,
): QuestDef {
  const sponsor = npcs.find((npc) => npc.id === binding.sponsorNpcId)
  const stakeholder = binding.stakeholderNpcId
    ? npcs.find((npc) => npc.id === binding.stakeholderNpcId)
    : undefined
  const sponsorName = sponsor?.name ?? 'Kupiec'
  const stakeholderName = stakeholder?.name ?? 'Krewny'

  const dialogueActions: NonNullable<QuestDef['stages'][number]['dialogueActions']>[number][] = []
  if (binding.stakeholderNpcId) {
    dialogueActions.push({
      npc: { npcId: binding.stakeholderNpcId },
      playerLine: `Znalazłem dziennik zaginionej wyprawy. Należy do was — oddaję go tobie, ${stakeholderName}.`,
      npcLine: 'Dziękuję. Przynajmniej będziemy wiedzieć, co się z nimi naprawdę stało.',
      physicalOutcomeId: LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME,
      requireItemInstanceId: binding.journalInstanceId,
    })
  }
  dialogueActions.push({
    npc: { npcId: binding.sponsorNpcId },
    playerLine: `Oto dziennik wyprawy, którą sfinansowałeś, ${sponsorName}.`,
    npcLine: 'Dobrze. Ta historia zasługuje na formalne zamknięcie — i zapłatę dla ciebie.',
    physicalOutcomeId: LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
    requireItemInstanceId: binding.journalInstanceId,
  })
  dialogueActions.push({
    npc: { npcId: binding.sponsorNpcId },
    playerLine: 'Skarb jest twój, ale dziennik wyprawy zostaje przy mnie.',
    npcLine: 'Skarb miał wrócić z nimi, ale przynajmniej trafił w czyjeś ręce. Resztę zachowaj dla siebie.',
    physicalOutcomeId: LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
    requireItemInstanceId: binding.journalInstanceId,
  })

  const stages: QuestDef['stages'][number][] = [
    {
      objective: { type: 'talk_to_npc', npc: { npcId: binding.sponsorNpcId } },
      description: `Wysłuchaj ${sponsorName} — sfinansował wyprawę po legendarny skarb, która nie wróciła.`,
      reminderLine: `${sponsorName} wskazał loch, do którego wyruszyła zaginiona wyprawa.`,
      playerLine: 'Słyszałem, że finansowałeś wyprawę po legendarny skarb.',
      progressLine:
        `Wyprawa nie wróciła. Ostatni raz widziano ją przy wejściu tutaj: ${caveDescription}.`,
      effects: [{
        type: 'reveal_location',
        locationId: binding.caveLocationId,
        setNavigation: true,
      }],
    },
    {
      objective: { type: 'loot_world_container', containerId: binding.campContainerId },
      description: 'Znajdź porzucony obóz wyprawy przy wejściu do lochu.',
      reminderLine: 'Przy wejściu do lochu powinien leżeć porzucony obóz wyprawy.',
      progressLine: 'Obóz jest opuszczony, ale wyprawa dotarła dalej. Trzeba iść głębiej.',
    },
    {
      objective: { type: 'loot_world_container', containerId: binding.journalContainerId },
      description: 'Odnajdź tobół dowódcy wyprawy z dziennikiem.',
      reminderLine: 'Głębiej w lochu powinien leżeć tobół dowódcy z dziennikiem wyprawy.',
      progressLine: 'Dziennik dowódcy opisuje ostatnie dni wyprawy — skarb miał być jeszcze głębiej.',
    },
    {
      objective: { type: 'loot_world_container', containerId: binding.evidenceContainerId },
      description: 'Odnajdź ostatnie ślady wyprawy — osobiste rzeczy uczestników.',
      reminderLine: 'Najgłębsza część lochu powinna kryć ostatnie osobiste rzeczy wyprawy.',
      progressLine: 'To koniec wyprawy. Prawdziwy skarb musi być bardzo blisko.',
    },
    {
      objective: { type: 'loot_world_container', containerId: binding.finalTreasureContainerId },
      description: `Odnajdź legendarny skarb, po który wysłał ich ${sponsorName}.`,
      reminderLine: 'Skarb powinien być w najgłębszej części lochu.',
      progressLine: 'Skarb jest prawdziwy i należy teraz do ciebie. Zostaje decyzja, co zrobić z dziennikiem.',
    },
    {
      objective: { type: 'await_quest_outcome' },
      description: binding.stakeholderNpcId
        ? `Zdecyduj, komu przekazać dziennik wyprawy — ${stakeholderName}, ${sponsorName}, albo zatrzymaj go dla siebie.`
        : `Zdecyduj, czy oddać dziennik wyprawy ${sponsorName}, czy zatrzymać go dla siebie.`,
      reminderLine: 'Dziennik wyprawy wciąż wymaga decyzji.',
      dialogueActions,
    },
  ]

  const outcomes: QuestDef['outcomes'][number][] = []
  if (binding.stakeholderNpcId) {
    outcomes.push({
      id: LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME,
      state: 'complete',
      resultText: 'Dziennik wyprawy wrócił do rodziny zaginionego uczestnika. Skarb zostaje przy tobie.',
      consequences: {
        relations: [{ npc: { npcId: binding.stakeholderNpcId }, delta: 3 }],
        social: {
          reputation: { trust: 4, benevolence: 5, integrity: 3 },
          renown: 2,
        },
      },
    })
  }
  outcomes.push({
    id: LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME,
    state: 'complete',
    resultText: 'Dziennik trafił do sponsora wyprawy, wraz z zapłatą za odnalezienie prawdy. Skarb zostaje przy tobie.',
    reward: { visibility: 'shown', items: [{ kind: 'coin', count: 25 }] },
    consequences: {
      relations: [
        { npc: { npcId: binding.sponsorNpcId }, delta: 3 },
        ...(binding.stakeholderNpcId ? [{ npc: { npcId: binding.stakeholderNpcId }, delta: -1 }] : []),
      ],
      social: {
        reputation: { competence: 3, integrity: 2 },
        renown: 3,
      },
    },
  })
  outcomes.push({
    id: LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME,
    state: 'complete',
    resultText: 'Skarb i dziennik zostają przy tobie. Prawda o losie wyprawy nigdy do nikogo nie trafia.',
    consequences: {
      relations: [
        { npc: { npcId: binding.sponsorNpcId }, delta: -2 },
        ...(binding.stakeholderNpcId ? [{ npc: { npcId: binding.stakeholderNpcId }, delta: -2 }] : []),
      ],
      social: {
        reputation: { trust: -2, integrity: -3 },
        renown: 1,
      },
    },
  })

  return {
    id: binding.questId,
    title: 'Zaginiona wyprawa po skarb',
    description:
      `${sponsorName} z osady ${settlementName} sfinansował wyprawę po legendarny skarb, `
      + `która wyruszyła tutaj: ${caveDescription} — i nigdy nie wróciła.`,
    giverName: sponsorName,
    giver: { npcId: binding.sponsorNpcId },
    settlementId: binding.settlementId,
    offerLine:
      `Wysłałem ludzi po legendarny skarb. To ${caveDescription}. Nie wrócili, `
      + 'a ja wciąż nie wiem, co się z nimi stało.',
    stages,
    reportLine: 'Sprawa zaginionej wyprawy ma wreszcie zakończenie.',
    outcomes,
    // The carried journal's own family/sponsor/keep choice IS the resolution
    // (plan quests-progression-033) — a generic opt-out here would strand
    // that carried instance outside any quest tracking.
    abandonment: { allowed: false },
  }
}
