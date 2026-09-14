import type { ItemInstance } from '../items/itemInstances'
import type { ItemKind } from '../items/items'
import type { NpcId } from '../settlement/npcState'
import type { SettlementDef } from '../settlement/settlementGenerator'
import type {
  CaveAdventureProfileReservationRequest,
  CaveContentAnchorClaimRequest,
  CaveContentReservationRequests,
} from '../world/caves/caveAdventureContentPolicy'
import type { CaveContentAnchor } from '../world/caves/caveContentAnchors'
import type { WorldGeneratedContainerSpec } from '../world/worldGeneratedContainers'
import type { SettlementOpportunityNpc } from './opportunities/settlementNpcMaterialization'
import type { QuestDef } from './quests'
import { caveWorldLocationId } from '../world/locations/darkForestTreasureSite'

/** Stable reservation key for adventure-cave EMPTY + anchor arbitration. */
export const OLD_BONES_RESERVATION_KEY = 'quests-progression-025'

export const OLD_BONES_QUEST_PREFIX = 'world:old-bones:'

export const OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME = 'return_to_first_claimant'
export const OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME = 'give_to_second_claimant'
export const OLD_BONES_KEEP_SIGNET_OUTCOME = 'keep_signet'

export const OLD_BONES_SIGNET_KIND = 'signet_ring' as const

/**
 * Derived world/quest binding — reconstructed on each boot, never persisted.
 *
 * @domain quests-progression
 */
export type OldBonesAdventureCaveBinding = {
  questId: string
  settlementId: string
  giverNpcId: NpcId
  claimantANpcId: NpcId
  claimantBNpcId?: NpcId
  caveId: string
  caveLocationId: string
  anchorId: string
  containerId: string
  signetInstanceId: string
}

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function oldBonesSignetInstanceId(caveId: string): string {
  return `quest:old-bones:${caveId}:signet`
}

export function oldBonesRemainsContainerId(anchorId: string): string {
  return `world-container:${OLD_BONES_RESERVATION_KEY}:${anchorId}`
}

export function oldBonesQuestId(settlementId: string, caveId: string): string {
  return `${OLD_BONES_QUEST_PREFIX}${settlementId}:${caveId}`
}

export function createOldBonesSignetInstance(caveId: string): ItemInstance {
  return { id: oldBonesSignetInstanceId(caveId), kind: OLD_BONES_SIGNET_KIND }
}

const REMAINS_SUPPLY: Partial<Record<ItemKind, number>> = {
  coin: 4,
  bandage: 1,
}

function adults(npcs: readonly SettlementOpportunityNpc[]): SettlementOpportunityNpc[] {
  return npcs.filter((npc) => !npc.child)
}

function adultsInHousehold(
  npcs: readonly SettlementOpportunityNpc[],
  householdId: string,
): SettlementOpportunityNpc[] {
  return adults(npcs).filter((npc) => npc.householdId === householdId)
}

/**
 * Deterministic family/giver selection for the old-bones story.
 * Prefers a household with two adults so claimant B can exist; giver is a
 * different adult (hunter → woodcutter → other). Does not invent NPCs.
 *
 * @domain quests-progression
 */
export function selectOldBonesNpcs(
  npcs: readonly SettlementOpportunityNpc[],
): {
  giver: SettlementOpportunityNpc
  claimantA: SettlementOpportunityNpc
  claimantB?: SettlementOpportunityNpc
} | null {
  const adultPool = adults(npcs)
  if (adultPool.length < 2) return null

  const householdIds = [...new Set(npcs.map((npc) => npc.householdId))]
    .map((householdId) => ({
      householdId,
      familyIndex: npcs.find((npc) => npc.householdId === householdId)?.familyIndex ?? 0,
      adults: adultsInHousehold(npcs, householdId),
    }))
    .filter((entry) => entry.adults.length >= 1)
    .sort((a, b) => {
      const twoA = a.adults.length >= 2 ? 0 : 1
      const twoB = b.adults.length >= 2 ? 0 : 1
      if (twoA !== twoB) return twoA - twoB
      return a.familyIndex - b.familyIndex || a.householdId.localeCompare(b.householdId)
    })

  const family = householdIds[0]
  if (!family) return null
  const claimantA = family.adults[0]!
  const claimantB = family.adults[1]
  const claimedIds = new Set<string>([claimantA.id])
  if (claimantB) claimedIds.add(claimantB.id)

  const giverPool = adultPool.filter((npc) => !claimedIds.has(npc.id))
  if (giverPool.length === 0) return null

  const hunters = giverPool
    .filter((npc) => npc.role === 'hunter')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  const woodcutters = giverPool
    .filter((npc) => npc.role === 'woodcutter')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  const others = giverPool.slice().sort((a, b) => a.id.localeCompare(b.id))
  const giver = hunters[0] ?? woodcutters[0] ?? others[0]
  if (!giver) return null

  return claimantB
    ? { giver, claimantA, claimantB }
    : { giver, claimantA }
}

function preferredAnchorForCave(
  caveId: string,
  contentAnchors: readonly CaveContentAnchor[],
  reservedAnchorIds: ReadonlySet<string>,
): CaveContentAnchor | null {
  const forCave = contentAnchors.filter((anchor) => (
    anchor.caveId === caveId
    && (anchor.role === 'sideTreasure' || anchor.role === 'finalTreasure')
    && !reservedAnchorIds.has(anchor.id)
  ))
  const side = forCave
    .filter((anchor) => anchor.role === 'sideTreasure')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  if (side[0]) return side[0]
  const finals = forCave
    .filter((anchor) => anchor.role === 'finalTreasure')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  return finals[0] ?? null
}

/**
 * Eligible adventure-cave anchors for this story. Consumes externally
 * reserved cave/anchor ids so later stories can arbitrate without baking
 * ownership into world-terrain.
 *
 * @domain quests-progression
 */
export function eligibleOldBonesAdventureAnchors(
  adventureCaveIds: readonly string[],
  contentAnchors: readonly CaveContentAnchor[],
  reservedCaveIds: ReadonlySet<string> = new Set(),
  reservedAnchorIds: ReadonlySet<string> = new Set(),
): { caveId: string, anchor: CaveContentAnchor }[] {
  const eligible: { caveId: string, anchor: CaveContentAnchor }[] = []
  for (const caveId of [...adventureCaveIds].sort()) {
    if (reservedCaveIds.has(caveId)) continue
    const anchor = preferredAnchorForCave(caveId, contentAnchors, reservedAnchorIds)
    if (!anchor) continue
    eligible.push({ caveId, anchor })
  }
  return eligible
}

/**
 * Resolves the old-bones binding from stable settlement/cave identity.
 * Emits declarative cave reservation inputs; callers must feed them into
 * `resolveCaveAdventureContentPolicy` before generic treasure materialization.
 *
 * @domain quests-progression
 */
export function resolveOldBonesAdventureCaveBinding(input: {
  worldSeed: number
  settlementDef: Pick<SettlementDef, 'id' | 'families'>
  adventureCaveIds: readonly string[]
  contentAnchors: readonly CaveContentAnchor[]
  npcs: readonly SettlementOpportunityNpc[]
  reservedCaveIds?: ReadonlySet<string>
  reservedAnchorIds?: ReadonlySet<string>
}): OldBonesAdventureCaveBinding | null {
  const npcPick = selectOldBonesNpcs(input.npcs)
  if (!npcPick) return null
  const eligible = eligibleOldBonesAdventureAnchors(
    input.adventureCaveIds,
    input.contentAnchors,
    input.reservedCaveIds ?? new Set(),
    input.reservedAnchorIds ?? new Set(),
  )
  if (eligible.length === 0) return null
  const pick = stableHash(
    `${input.worldSeed}\0${input.settlementDef.id}\0old-bones-cave`,
  ) % eligible.length
  const chosen = eligible[pick]!
  return {
    questId: oldBonesQuestId(input.settlementDef.id, chosen.caveId),
    settlementId: input.settlementDef.id,
    giverNpcId: npcPick.giver.id,
    claimantANpcId: npcPick.claimantA.id,
    ...(npcPick.claimantB ? { claimantBNpcId: npcPick.claimantB.id } : {}),
    caveId: chosen.caveId,
    caveLocationId: caveWorldLocationId(chosen.caveId),
    anchorId: chosen.anchor.id,
    containerId: oldBonesRemainsContainerId(chosen.anchor.id),
    signetInstanceId: oldBonesSignetInstanceId(chosen.caveId),
  }
}

export function oldBonesProfileReservation(
  binding: OldBonesAdventureCaveBinding,
): CaveAdventureProfileReservationRequest {
  return {
    reservationKey: OLD_BONES_RESERVATION_KEY,
    caveId: binding.caveId,
    profile: 'EMPTY',
  }
}

export function oldBonesAnchorClaim(
  binding: OldBonesAdventureCaveBinding,
): CaveContentAnchorClaimRequest {
  return {
    reservationKey: OLD_BONES_RESERVATION_KEY,
    anchorId: binding.anchorId,
  }
}

export function oldBonesCaveReservationRequests(
  binding: OldBonesAdventureCaveBinding,
): CaveContentReservationRequests {
  return {
    profileReservations: [oldBonesProfileReservation(binding)],
    anchorClaims: [oldBonesAnchorClaim(binding)],
  }
}

/**
 * World-generated remains cache at the claimed adventure anchor.
 * Exists before quest acceptance; saved snapshots suppress re-seeding.
 *
 * @domain quests-progression
 */
export function oldBonesRemainsContainerSpec(
  binding: OldBonesAdventureCaveBinding,
  anchor: CaveContentAnchor,
): WorldGeneratedContainerSpec {
  return {
    id: binding.containerId,
    kind: 'chest',
    x: anchor.x,
    y: anchor.y,
    z: anchor.z,
    yaw: anchor.yaw,
    initialCounts: REMAINS_SUPPLY,
    initialInstances: [createOldBonesSignetInstance(binding.caveId)],
    spatialContext: { kind: 'cave', caveId: binding.caveId },
  }
}

export function isOldBonesRemainsLooted(
  instances: readonly { id: string }[],
  signetInstanceId: string,
): boolean {
  return !instances.some((instance) => instance.id === signetInstanceId)
}

/**
 * Materializes the old-bones quest for one resolved binding.
 *
 * @domain quests-progression
 */
export function buildOldBonesAdventureCaveQuest(
  binding: OldBonesAdventureCaveBinding,
  npcs: readonly SettlementOpportunityNpc[],
  settlementName: string,
): QuestDef {
  const giver = npcs.find((npc) => npc.id === binding.giverNpcId)
  const claimantA = npcs.find((npc) => npc.id === binding.claimantANpcId)
  const claimantB = binding.claimantBNpcId
    ? npcs.find((npc) => npc.id === binding.claimantBNpcId)
    : undefined
  const giverName = giver?.name ?? 'Mieszkaniec'
  const claimantAName = claimantA?.name ?? 'Spadkobierca'
  const claimantBName = claimantB?.name ?? 'Krewniak'

  const stages: QuestDef['stages'][number][] = [
    {
      objective: { type: 'talk_to_npc', npc: { npcId: binding.giverNpcId } },
      description: `Wysłuchaj ${giverName} — wie o starych śladach w jaskini.`,
      reminderLine: `${giverName} wspominał o ludzkich śladach w konkretnej jaskini.`,
      playerLine: 'Słyszałem, że w okolicy są stare ślady w jaskini.',
      progressLine:
        'W jednej z jaskiń leżą stare ludzkie szczątki. Nie wiem, czyje — ale ktoś z osady powinien pamiętać takie historie.',
      effects: [{
        type: 'reveal_location',
        locationId: binding.caveLocationId,
        setNavigation: true,
      }],
    },
    {
      objective: { type: 'talk_to_npc', npc: { npcId: binding.claimantANpcId } },
      description: `Porozmawiaj z ${claimantAName} o rodzinnej historii.`,
      reminderLine: `${claimantAName} może połączyć te ślady z zaginięciem przodka.`,
      playerLine: 'Znalazłem wieści o starych szczątkach. Czy ktoś z waszej rodziny zaginął lata temu?',
      progressLine:
        'Dawno temu nasz przodek zniknął, niosąc rodowy sygnet. Jeśli te szczątki są jego — sygnet powinien wrócić do rodziny.',
    },
    {
      objective: { type: 'loot_world_container', containerId: binding.containerId },
      description: 'Odnajdź szczątki w wskazanej jaskini i zabierz rodowy sygnet.',
      reminderLine: 'W jaskini powinny leżeć stare szczątki z sygnetem.',
      progressLine: 'Sygnet jest u ciebie. Teraz trzeba zdecydować, komu go oddać.',
    },
  ]

  if (binding.claimantBNpcId) {
    stages.push({
      objective: { type: 'talk_to_npc', npc: { npcId: binding.claimantBNpcId } },
      description: `Wysłuchaj ${claimantBName} — też zgłasza roszczenie do sygnetu.`,
      reminderLine: `${claimantBName} twierdzi, że sygnet powinien trafić do niego.`,
      playerLine: 'Znalazłem sygnet. Twierdzisz, że należy się tobie?',
      progressLine:
        'To też nasza krew. Przodek obiecał ten sygnet mojej linii — nie oddawaj go bez namysłu.',
    })
  }

  const dialogueActions: NonNullable<QuestDef['stages'][number]['dialogueActions']>[number][] = [
    {
      npc: { npcId: binding.claimantANpcId },
      playerLine: `Oddaję sygnet tobie, ${claimantAName}.`,
      npcLine: 'Dziękuję. Przynajmniej coś z tamtej historii wraca do domu.',
      physicalOutcomeId: OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      requireItemInstanceId: binding.signetInstanceId,
    },
  ]
  if (binding.claimantBNpcId) {
    dialogueActions.push({
      npc: { npcId: binding.claimantBNpcId },
      playerLine: `Oddaję sygnet tobie, ${claimantBName}.`,
      npcLine: 'Wiedziałem, że sprawiedliwość jest po naszej stronie.',
      physicalOutcomeId: OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
      requireItemInstanceId: binding.signetInstanceId,
    })
  }
  dialogueActions.push({
    npc: { npcId: binding.claimantANpcId },
    playerLine: 'Znalazłem szczątki i sygnet, ale sygnet zostaje przy mnie.',
    npcLine: 'Więc przynosisz prawdę, a dziedzictwo zabierasz sobie. Zapamiętam.',
    physicalOutcomeId: OLD_BONES_KEEP_SIGNET_OUTCOME,
    requireItemInstanceId: binding.signetInstanceId,
  })

  stages.push({
    objective: { type: 'await_quest_outcome' },
    description: binding.claimantBNpcId
      ? `Zdecyduj, kto otrzyma sygnet — ${claimantAName}, ${claimantBName}, albo zachowaj go.`
      : `Zdecyduj, czy oddajesz sygnet ${claimantAName}, czy zachowujesz go.`,
    reminderLine: 'Sygnet wciąż wymaga decyzji.',
    dialogueActions,
  })

  const outcomes: QuestDef['outcomes'][number][] = [
    {
      id: OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME,
      state: 'complete',
      resultText: 'Sygnet wrócił do pierwszego spadkobiercy.',
      consequences: {
        relations: [{ npc: { npcId: binding.claimantANpcId }, delta: 3 }],
        social: {
          reputation: { trust: 4, benevolence: 5, integrity: 3 },
          renown: 3,
        },
      },
    },
  ]
  if (binding.claimantBNpcId) {
    outcomes.push({
      id: OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME,
      state: 'complete',
      resultText: 'Sygnet trafił do drugiego spadkobiercy.',
      consequences: {
        relations: [
          { npc: { npcId: binding.claimantBNpcId }, delta: 2 },
          { npc: { npcId: binding.claimantANpcId }, delta: -2 },
        ],
        social: {
          reputation: { trust: 1, benevolence: 2, integrity: 1 },
          renown: 2,
        },
      },
    })
  }
  outcomes.push({
    id: OLD_BONES_KEEP_SIGNET_OUTCOME,
    state: 'complete',
    resultText: 'Szczątki zostały rozpoznane, ale sygnet został przy tobie.',
    consequences: {
      relations: [
        { npc: { npcId: binding.claimantANpcId }, delta: -1 },
        ...(binding.claimantBNpcId
          ? [{ npc: { npcId: binding.claimantBNpcId }, delta: -1 }]
          : []),
      ],
      social: {
        reputation: { trust: -1, integrity: -2 },
        renown: 1,
      },
    },
  })

  return {
    id: binding.questId,
    title: 'Stare kości',
    description:
      `${giverName} z osady ${settlementName} wskazuje starą jaskinię ze śladami człowieka. ${claimantAName} łączy je z zaginionym przodkiem i rodowym sygnetem.`,
    giverName,
    giver: { npcId: binding.giverNpcId },
    settlementId: binding.settlementId,
    offerLine:
      'W jednej jaskini leżą stare ludzkie szczątki. Nie wiem, czyje — ale ktoś w osadzie pamięta takie historie lepiej niż ja.',
    stages,
    reportLine: 'Ta stara sprawa wreszcie ma koniec.',
    outcomes,
    // The carried signet's own return/give/keep choice IS the resolution
    // (plan quests-progression-033) — a generic opt-out here would strand
    // that carried instance outside any quest tracking.
    abandonment: { allowed: false },
  }
}
