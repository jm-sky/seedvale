import type { SettlementVillageTorch } from '../../settlement/settlementVillageTorch'
import type { QuestDef } from '../quests'
import type { OpportunityNpc } from './worldQuestOpportunityTypes'
import { adultOpportunityNpcs } from './rpgQuestMatrices'

const GUARD_EVENING_QUEST_PREFIX = 'guard-evening-duty:'
const GUARD_EVENING_OUTCOME = 'guard_evening_lights_complete'

/**
 * Stable quest id for the guard evening lighting duty at one settlement.
 *
 * @domain quests-progression
 */
export function guardEveningDutyQuestId(settlementId: string, giverNpcId: string): string {
  return `${GUARD_EVENING_QUEST_PREFIX}${settlementId}:${giverNpcId}`
}

export function parseGuardEveningDutyQuestId(questId: string): {
  settlementId: string
  giverNpcId: string
} | null {
  if (!questId.startsWith(GUARD_EVENING_QUEST_PREFIX)) return null
  const rest = questId.slice(GUARD_EVENING_QUEST_PREFIX.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon <= 0) return null
  const giverNpcId = rest.slice(lastColon + 1)
  const settlementId = rest.slice(0, lastColon)
  if (!settlementId || !giverNpcId) return null
  return { settlementId, giverNpcId }
}

/** Deterministic home-settlement adult guard (plan quests-progression-021). */
export function selectGuardQuestGiver(npcs: readonly OpportunityNpc[]): OpportunityNpc | undefined {
  return adultOpportunityNpcs(npcs).find((npc) => npc.role === 'guard')
}

function pickEveningDutyTorches(
  torches: readonly SettlementVillageTorch[],
  settlementId: string,
  giverNpcId: string,
): readonly string[] {
  const ids = torches
    .map((t) => t.id)
    .filter((id) => id.startsWith(`${settlementId}:`))
    .slice()
    .sort((a, b) => a.localeCompare(b))
  if (ids.length === 0) return []
  const take = Math.min(3, ids.length)
  let hash = 2166136261
  const key = `${settlementId}\0${giverNpcId}`
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const start = (hash >>> 0) % ids.length
  const picked: string[] = []
  for (let i = 0; i < take; i++) picked.push(ids[(start + i) % ids.length]!)
  return picked
}

/**
 * One-shot guard evening lighting quest when settlement infrastructure exists.
 *
 * @domain quests-progression
 */
export function buildGuardEveningDutyQuest(input: {
  settlementId: string
  settlementName: string
  npcs: readonly OpportunityNpc[]
  villageTorches: readonly SettlementVillageTorch[]
  hasCampfire: boolean
  persistedQuestIds?: readonly string[]
}): QuestDef | null {
  const giver = selectGuardQuestGiver(input.npcs)
  if (!giver) return null
  if (!input.hasCampfire || input.villageTorches.length === 0) return null
  const torchIds = pickEveningDutyTorches(input.villageTorches, input.settlementId, giver.id)
  if (torchIds.length === 0) return null
  const id = guardEveningDutyQuestId(input.settlementId, giver.id)
  const persisted = new Set(input.persistedQuestIds ?? [])
  if (persisted.has(id)) {
    // Still materialize so save progress can restore — same as hunter chain.
  }
  return {
    id,
    title: 'Światła na noc',
    description: `${giver.name} prosi o ręczne przygotowanie osady ${input.settlementName} na noc.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    settlementId: input.settlementId,
    offerLine:
      'Wieczorem trzeba zapalić pochodnie i ognisko — dziś zrób to sam, żebym mógł iść na obchód.',
    availability: {
      prerequisites: [{ type: 'evening_offer_window', giverNpcId: giver.id }],
    },
    stages: [
      {
        objective: {
          type: 'light_settlement_fires',
          settlementId: input.settlementId,
          torchIds,
          requireCampfire: true,
        },
        description: 'Zapal wskazane pochodnie i ognisko osady.',
        reminderLine: 'Jeszcze nie wszystkie światła są zapalone — pochodnie i ognisko muszą płonąć.',
        progressLine: 'Dobrze — osada jest gotowa na noc.',
      },
    ],
    reportPromptLine: 'Zapalione wszystko, o co prosiłem?',
    reportPlayerLine: 'Pochodnie i ognisko są zapalone.',
    reportLine: 'Dzięki. Teraz mogę spokojnie pilnować osady.',
    outcomes: [
      {
        id: GUARD_EVENING_OUTCOME,
        state: 'complete',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 3 }] },
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 1 }],
          social: { reputation: { benevolence: 2, trust: 1 }, renown: 1 },
        },
      },
    ],
  }
}
