import type { NpcId } from '../settlement/npcState'
import type { OpportunityNpc } from './opportunities/worldQuestOpportunityTypes'
import type { QuestDef } from './quests'
import {
  HUNTER_III_COMPLETE_OUTCOME,
  hunterProfessionQuestId,
  selectHunterQuestGiver,
} from './opportunities/hunterProfessionQuests'
import { adultOpportunityNpcs } from './opportunities/rpgQuestMatrices'

const HUNTERS_BROTHERHOOD_INTRO_PREFIX = 'hunters-brotherhood-intro:'

/** Terminal membership fact for later Brotherhood acts. Not a faction record. */
export const HUNTERS_BROTHERHOOD_JOINED_OUTCOME = 'hunters_brotherhood_joined'

/**
 * Stable two-settlement Brotherhood cast. Reconstructed from settlement NPC
 * projections; never persisted separately.
 *
 * `inviterNpcId === practicalNpcId` is an invariant: the home Hunter I–III
 * giver invites and remains the practical member.
 *
 * @domain quests-progression
 */
export type HuntersBrotherhoodBinding = {
  homeSettlementId: string
  homeSettlementName: string
  secondSettlementId: string
  secondSettlementName: string
  inviterNpcId: NpcId
  inviterName: string
  practicalNpcId: NpcId
  masterNpcId: NpcId
  masterName: string
  trophyNpcId: NpcId
  trophyName: string
  ambitiousNpcId: NpcId
  ambitiousName: string
}

/**
 * Home plus already-bounded nearby settlements in nearest/id order.
 *
 * @domain quests-progression
 */
export type HuntersBrotherhoodCastInput = {
  home: {
    id: string
    name: string
    npcs: readonly OpportunityNpc[]
  }
  neighbors: readonly {
    id: string
    name: string
    npcs: readonly OpportunityNpc[]
  }[]
}

/**
 * Stable quest id from home settlement + Hunter I–III inviter.
 *
 * @domain quests-progression
 */
export function huntersBrotherhoodIntroductionQuestId(
  homeSettlementId: string,
  inviterNpcId: NpcId,
): string {
  return `${HUNTERS_BROTHERHOOD_INTRO_PREFIX}${homeSettlementId}:${inviterNpcId}`
}

function remainingAdults(
  pool: readonly OpportunityNpc[],
  taken: ReadonlySet<NpcId>,
): OpportunityNpc[] {
  return pool.filter((npc) => !taken.has(npc.id))
}

function pickPreferredHunterThenAdult(
  candidates: readonly OpportunityNpc[],
): OpportunityNpc | undefined {
  return candidates.find((npc) => npc.role === 'hunter') ?? candidates[0]
}

function toBinding(
  home: HuntersBrotherhoodCastInput['home'],
  second: HuntersBrotherhoodCastInput['neighbors'][number],
  inviter: OpportunityNpc,
  master: OpportunityNpc,
  trophy: OpportunityNpc,
  ambitious: OpportunityNpc,
): HuntersBrotherhoodBinding {
  return {
    homeSettlementId: home.id,
    homeSettlementName: home.name,
    secondSettlementId: second.id,
    secondSettlementName: second.name,
    inviterNpcId: inviter.id,
    inviterName: inviter.name,
    practicalNpcId: inviter.id,
    masterNpcId: master.id,
    masterName: master.name,
    trophyNpcId: trophy.id,
    trophyName: trophy.name,
    ambitiousNpcId: ambitious.id,
    ambitiousName: ambitious.name,
  }
}

/**
 * Deterministic Brotherhood roster from home + bounded nearby adult NPCs.
 * Returns undefined when the world cannot supply four distinct adults across
 * home and one nearby settlement, including at least one adult from the second.
 *
 * @domain quests-progression
 */
export function resolveHuntersBrotherhoodBinding(
  input: HuntersBrotherhoodCastInput,
): HuntersBrotherhoodBinding | undefined {
  const inviter = selectHunterQuestGiver(input.home.npcs)
  if (!inviter) return undefined

  const homeAdults = adultOpportunityNpcs(input.home.npcs)
  for (const neighbor of input.neighbors) {
    const secondAdults = adultOpportunityNpcs(neighbor.npcs)
    if (secondAdults.length === 0) continue
    if (homeAdults.length + secondAdults.length < 4) continue

    const master = pickPreferredHunterThenAdult(secondAdults)
    if (!master) continue

    const taken = new Set<NpcId>([inviter.id, master.id])
    const pool = [...homeAdults, ...secondAdults]
    const trophy = pickPreferredHunterThenAdult(remainingAdults(pool, taken))
    if (!trophy) continue
    taken.add(trophy.id)
    const ambitious = remainingAdults(pool, taken)[0]
    if (!ambitious) continue

    return toBinding(input.home, neighbor, inviter, master, trophy, ambitious)
  }
  return undefined
}

function materializeHuntersBrotherhoodIntroductionQuest(
  binding: HuntersBrotherhoodBinding,
): QuestDef {
  const hunterIIIId = hunterProfessionQuestId(binding.homeSettlementId, binding.inviterNpcId, 3)
  const master = { npcId: binding.masterNpcId }
  const trophy = { npcId: binding.trophyNpcId }
  const ambitious = { npcId: binding.ambitiousNpcId }
  const inviter = { npcId: binding.inviterNpcId }
  return {
    id: huntersBrotherhoodIntroductionQuestId(binding.homeSettlementId, binding.inviterNpcId),
    title: 'Krąg myśliwych',
    description:
      `${binding.inviterName} z osady ${binding.homeSettlementName} zaprasza cię do małego kręgu myśliwych `
      + `— mistrza ${binding.masterName} z osady ${binding.secondSettlementName}, `
      + `${binding.trophyName} i ${binding.ambitiousName}. To nie nowy fach, tylko ludzie, których warto znać z polowania.`,
    giverName: binding.inviterName,
    giver: inviter,
    settlementId: binding.homeSettlementId,
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: hunterIIIId,
        outcomeIds: [HUNTER_III_COMPLETE_OUTCOME],
      }],
    },
    offer: { exposure: 'story' },
    offerLine:
      `Znasz już nasz fach. Jest mały krąg — ${binding.masterName} z ${binding.secondSettlementName} pilnuje równowagi, `
      + `${binding.trophyName} goni za wielką zwierzyną, a ${binding.ambitiousName} chce dowieść, że dorosnął do łowów. `
      + 'Przedstawię cię im. Porozmawiaj z każdym, potem wróć.',
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: master },
        objectives: [
          { id: 'master', objective: { type: 'talk_to_npc', npc: master } },
          { id: 'trophy', objective: { type: 'talk_to_npc', npc: trophy } },
          { id: 'ambitious', objective: { type: 'talk_to_npc', npc: ambitious } },
        ],
        mode: 'all',
        description:
          `Wysłuchaj mistrza ${binding.masterName} (równowaga i tradycja), `
          + `${binding.trophyName} (trofea i prestiż) oraz ${binding.ambitiousName} (ambicja).`,
        reminderLine:
          `Porozmawiaj z ${binding.masterName}, ${binding.trophyName} i ${binding.ambitiousName} — potem wróć.`,
        playerLine: `Przyszedłem z zaproszenia ${binding.inviterName}. Chcę poznać krąg.`,
        progressLine:
          `Dobrze, że ${binding.inviterName} cię przysłał. Każdy z nas inaczej patrzy na łowy — posłuchaj pozostałych i wróć do niego.`,
      },
    ],
    reportPromptLine: 'Poznałeś już resztę kręgu?',
    reportPlayerLine: 'Rozmawiałem z mistrzem, z łowcą trofeów i z najmłodszym z was.',
    reportLine:
      'Wysłuchałeś ich. Od dziś jesteś z nami — nie jako gość, tylko jako ktoś, kto zna ten krąg. Łowy i decyzje przyjdą później.',
    outcomes: [
      {
        id: HUNTERS_BROTHERHOOD_JOINED_OUTCOME,
        state: 'complete',
        consequences: {
          relations: [
            { npc: inviter, delta: 1 },
            { npc: master, delta: 1 },
          ],
        },
      },
    ],
  }
}

/**
 * Story invitation after Hunter III. Materializes whenever the cast resolves;
 * `quest_outcome` availability still gates offering.
 *
 * @domain quests-progression
 */
export function buildHuntersBrotherhoodIntroductionQuest(
  input: HuntersBrotherhoodCastInput,
): QuestDef | undefined {
  const binding = resolveHuntersBrotherhoodBinding(input)
  if (!binding) return undefined
  return materializeHuntersBrotherhoodIntroductionQuest(binding)
}
