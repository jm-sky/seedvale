import type { RpgQuestMatrixId, SettlementQuestOpportunity } from './worldQuestOpportunityTypes'

/**
 * Small per-settlement cap on generated opportunities. Concrete value is
 * tunable after playtests, not a gameplay contract.
 *
 * @domain quests-progression
 */
export const SETTLEMENT_QUEST_OPPORTUNITY_LIMIT = 2

/**
 * World-driven problems outrank optional RPG stories when they compete for
 * a limited settlement slot. Lower is higher priority.
 *
 * @domain quests-progression
 */
export function settlementOpportunityPriority(opportunity: SettlementQuestOpportunity): number {
  return opportunity.kind === 'rpg-matrix' ? 1 : 0
}

function rpgMatrixKey(opportunity: SettlementQuestOpportunity): RpgQuestMatrixId | null {
  return opportunity.kind === 'rpg-matrix' ? opportunity.matrixId : null
}

/** FNV-1a so different settlements prefer different RPG matrices without Math.random. */
function stableHash(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function compareOpportunities(a: SettlementQuestOpportunity, b: SettlementQuestOpportunity): number {
  const priority = settlementOpportunityPriority(a) - settlementOpportunityPriority(b)
  if (priority !== 0) return priority
  if (a.kind === 'rpg-matrix' && b.kind === 'rpg-matrix') {
    const hashA = stableHash(`${a.settlementId}\0${a.matrixId}`)
    const hashB = stableHash(`${b.settlementId}\0${b.matrixId}`)
    if (hashA !== hashB) return hashA - hashB
  }
  return a.id.localeCompare(b.id)
}

/**
 * Shared settlement opportunity selection. Persisted generated ids are always
 * kept so save/load can rematerialize the same definition. World-driven
 * candidates are not dropped for RPG stories. RPG matrices do not occupy
 * two slots of the same matrix in one settlement.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Selects which lightweight candidates become QuestDefs.
 */
export function selectSettlementQuestOpportunities(input: {
  candidates: readonly SettlementQuestOpportunity[]
  persistedQuestIds?: readonly string[]
  limit?: number
}): SettlementQuestOpportunity[] {
  const limit = input.limit ?? SETTLEMENT_QUEST_OPPORTUNITY_LIMIT
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]))
  const persisted = new Set(input.persistedQuestIds ?? [])
  const selected: SettlementQuestOpportunity[] = []
  const selectedIds = new Set<string>()
  const selectedMatrices = new Set<RpgQuestMatrixId>()

  const take = (opportunity: SettlementQuestOpportunity, ignoreLimit: boolean): void => {
    if (selectedIds.has(opportunity.id)) return
    if (!ignoreLimit && selected.length >= limit) return
    const matrix = rpgMatrixKey(opportunity)
    if (matrix && selectedMatrices.has(matrix)) return
    selected.push(opportunity)
    selectedIds.add(opportunity.id)
    if (matrix) selectedMatrices.add(matrix)
  }

  for (const questId of input.persistedQuestIds ?? []) {
    const opportunity = byId.get(questId)
    if (opportunity) take(opportunity, true)
  }

  const rest = input.candidates
    .filter((candidate) => !persisted.has(candidate.id))
    .slice()
    .sort(compareOpportunities)

  for (const opportunity of rest) {
    take(opportunity, opportunity.kind !== 'rpg-matrix')
  }

  return selected
}
