import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type { ItemKind } from '../../items/items'
import type { NpcId } from '../../settlement/npcState'
import type { QuestDef } from '../quests'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'
import { adultOpportunityNpcs } from './rpgQuestMatrices'

const HUNTER_QUEST_PREFIX = 'hunter-profession:'
const HUNTER_I_OUTCOME = 'hunter_i_complete'
const HUNTER_II_OUTCOME = 'hunter_ii_complete'
const HUNTER_III_OUTCOME = 'hunter_iii_complete'

const HABITAT_FEED_FOODS: readonly ItemKind[] = ['apple', 'carrot', 'berries']

function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Stable quest id for one Hunter profession step at a settlement.
 *
 * @domain quests-progression
 */
export function hunterProfessionQuestId(settlementId: string, giverNpcId: NpcId, step: 1 | 2 | 3): string {
  return `${HUNTER_QUEST_PREFIX}${settlementId}:${giverNpcId}:${step}`
}

export function parseHunterProfessionQuestId(questId: string): {
  settlementId: string
  giverNpcId: NpcId
  step: 1 | 2 | 3
} | null {
  if (!questId.startsWith(HUNTER_QUEST_PREFIX)) return null
  const rest = questId.slice(HUNTER_QUEST_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length < 3) return null
  const stepRaw = parts[parts.length - 1]
  const step = Number(stepRaw)
  if (step !== 1 && step !== 2 && step !== 3) return null
  const giverNpcId = parts[parts.length - 2] as NpcId
  const settlementId = parts.slice(0, parts.length - 2).join(':')
  if (!settlementId || !giverNpcId) return null
  return { settlementId, giverNpcId, step }
}

/** Deterministic adult Hunter giver for a settlement (plan quests-progression-020). */
export function selectHunterQuestGiver(npcs: readonly OpportunityNpc[]): OpportunityNpc | undefined {
  return adultOpportunityNpcs(npcs).find((npc) => npc.role === 'hunter')
}

function pickSettlementThicket(
  spawners: readonly PreySpawner[],
  settlementId: string,
  giverNpcId: NpcId,
): PreySpawner | undefined {
  const thickets = spawners
    .filter((spawner) => spawner.type === 'thicket' && spawner.id.startsWith(`${settlementId}:`))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
  if (thickets.length === 0) return undefined
  const index = stableHash(`${settlementId}\0${giverNpcId}`) % thickets.length
  return thickets[index]
}

function materializeHunterI(giver: OpportunityNpc, settlementId: string, settlementName: string): QuestDef {
  const id = hunterProfessionQuestId(settlementId, giver.id, 1)
  return {
    id,
    title: 'Pierwsze trofea',
    description:
      `${giver.name} z osady ${settlementName} uczy podstaw polowania — sarny i skóry, nie tylko mięso w plecaku.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    settlementId,
    offerLine:
      'Chcę zobaczyć, czy umiesz oprawić sarnę jak należy. Upoluj trzy i przynieś skóry — wtedy dam ci łuk na start.',
    stages: [
      {
        objective: { type: 'harvest_animals', kind: 'deer', count: 3 },
        description: 'Upoluj i opraw trzy sarny.',
        reminderLine: 'Potrzebuję trzech saren oprawionych twoim nożem — sama skóra w plecaku to za mało.',
      },
      {
        objective: { type: 'gather_item', kind: 'hide', count: 3 },
        description: 'Oddaj trzy skóry myśliwemu.',
        reminderLine: 'Masz już trzy skóry ze saren?',
        playerLine: 'Mam trzy skóry, o które prosiłeś.',
      },
    ],
    reportPromptLine: 'Udało się upolować te sarny?',
    reportPlayerLine: 'Upolowałem trzy sarny i przyniosłem skóry.',
    reportLine: 'Dobra robota. Trzymaj łuk — nauczysz się nim strzelać na polowaniu.',
    outcomes: [
      {
        id: HUNTER_I_OUTCOME,
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'short_bow', count: 1 }] },
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 2 }],
          social: { reputation: { competence: 4, trust: 2 }, renown: 4 },
        },
      },
    ],
  }
}

function materializeHunterII(
  giver: OpportunityNpc,
  settlementId: string,
  settlementName: string,
  hunterIQuestId: string,
): QuestDef {
  const id = hunterProfessionQuestId(settlementId, giver.id, 2)
  return {
    id,
    title: 'Poroża jeleni',
    description:
      `${giver.name} z osady ${settlementName} prosi o poroża z dorosłych jeleni — trofeum z prawdziwego polowania, nie z magazynu.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    settlementId,
    availability: { prerequisites: [{ type: 'quest_outcome', questId: hunterIQuestId, outcomeIds: [HUNTER_I_OUTCOME] }] },
    offerLine:
      'Teraz jelenie. Upoluj je i przynieś dwa poroża — nie każdy dorosły je nosi, ale bez pracy nie ma pysznego mięsa.',
    stages: [
      {
        objective: { type: 'harvest_animals', kind: 'stag', count: 2 },
        description: 'Opraw dwa dorosłe jelenie.',
        reminderLine: 'Potrzebuję dowodu, że polujesz na jelenie — opraw przynajmniej dwa.',
      },
      {
        objective: { type: 'gather_item', kind: 'antler', count: 2 },
        description: 'Oddaj dwa poroża.',
        reminderLine: 'Masz już dwa poroża?',
        playerLine: 'Przyniosłem dwa poroża z jeleni.',
      },
    ],
    reportPromptLine: 'Znalazłeś poroża?',
    reportPlayerLine: 'Upolowałem jelenie i mam poroża.',
    reportLine: 'Solidna robota. Ten łuk myśliwski lepiej trzyma na większej zwierzynie.',
    outcomes: [
      {
        id: HUNTER_II_OUTCOME,
        state: 'complete',
        reward: { visibility: 'shown', items: [{ kind: 'hunting_bow', count: 1 }] },
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 2 }],
          social: { reputation: { competence: 6, trust: 3 }, renown: 6 },
        },
      },
    ],
  }
}

function materializeHunterIII(
  giver: OpportunityNpc,
  settlementId: string,
  spawnerId: string,
  hunterIIQuestId: string,
): QuestDef {
  const id = hunterProfessionQuestId(settlementId, giver.id, 3)
  return {
    id,
    title: 'Pomoc przy zagajniku',
    description:
      `${giver.name} wskazuje zagajnik, gdzie zwierzyna ma gorszy dostęp do pożywienia — zostaw tam coś do jedzenia.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    settlementId,
    availability: { prerequisites: [{ type: 'quest_outcome', questId: hunterIIQuestId, outcomeIds: [HUNTER_II_OUTCOME] }] },
    offerLine:
      'Przy jednym zagajniku zwierzyna głoduje częściej. Zostaw tam jabłka, marchew albo jagody — jak zjedzą, wróć z wieścią.',
    stages: [
      {
        objective: {
          type: 'feed_habitat_animals',
          spawnerId,
          kinds: ['deer', 'stag'],
          count: 3,
          foodKinds: HABITAT_FEED_FOODS,
        },
        description: 'Nakarm trzy zwierzęta z tego zagajnika zostawionym jedzeniem.',
        reminderLine: 'Zostaw przy zagajniku jedzenie, które sarna albo jeleń zje z ziemi.',
      },
    ],
    reportPromptLine: 'Zwierzyna zjadła to, co zostawiłeś?',
    reportPlayerLine: 'Zostawiłem jedzenie i zwierzyna je zjadła.',
    reportLine: 'Dzięki — teraz ten kąt lasu ma chwilę oddechu. Dobrze, że pomogłeś.',
    outcomes: [
      {
        id: HUNTER_III_OUTCOME,
        state: 'complete',
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 2 }],
          social: { reputation: { competence: 5, benevolence: 4, trust: 2 }, renown: 5 },
        },
      },
    ],
  }
}

/**
 * Hunter profession chain for one settlement (plan quests-progression-020).
 * Materializes only when an adult Hunter NPC exists; step III additionally
 * requires a settlement thicket spawner.
 *
 * @domain quests-progression
 */
export function buildHunterProfessionQuests(input: {
  settlementId: string
  settlementName: string
  npcs: readonly OpportunityNpc[]
  spawners: readonly PreySpawner[]
  persistedQuestIds?: readonly string[]
}): QuestDef[] {
  const giver = selectHunterQuestGiver(input.npcs)
  if (!giver) return []
  const hunterIId = hunterProfessionQuestId(input.settlementId, giver.id, 1)
  const hunterIIId = hunterProfessionQuestId(input.settlementId, giver.id, 2)
  const hunterIIIId = hunterProfessionQuestId(input.settlementId, giver.id, 3)
  const persisted = new Set(input.persistedQuestIds ?? [])
  const needIII = persisted.has(hunterIIIId)
  const thicket = pickSettlementThicket(input.spawners, input.settlementId, giver.id)
  const defs = [
    materializeHunterI(giver, input.settlementId, input.settlementName),
    materializeHunterII(giver, input.settlementId, input.settlementName, hunterIId),
  ]
  if (thicket || needIII) {
    if (!thicket) return defs
    defs.push(materializeHunterIII(
      giver,
      input.settlementId,
      thicket.id,
      hunterIIId,
    ))
  }
  return defs
}
