import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type {
  SettlementQuestOpportunity,
  WolfDenPressureOpportunity,
  WorldQuestSourceStatus,
} from './worldQuestOpportunityTypes'
import { isWolfDenPermanentlyDestroyed, isWolfDenPressureProblem } from '../../fauna/wolfDenScenario'

const WOLF_DEN_PRESSURE_PREFIX = 'world:wolf-den-pressure:'

/**
 * Stable generated quest/opportunity id. Deterministic from the den's
 * persistent spawner identity — never a runtime UUID.
 *
 * @domain quests-progression
 */
export function wolfDenPressureQuestId(spawnerId: string): string {
  return `${WOLF_DEN_PRESSURE_PREFIX}${spawnerId}`
}

export function parseWolfDenPressureQuestId(questId: string): { spawnerId: string } | null {
  if (!questId.startsWith(WOLF_DEN_PRESSURE_PREFIX)) return null
  const spawnerId = questId.slice(WOLF_DEN_PRESSURE_PREFIX.length)
  return spawnerId.length > 0 ? { spawnerId } : null
}

export function settlementIdFromWolfDenSpawnerId(spawnerId: string): string {
  const marker = ':wolfDen'
  const index = spawnerId.indexOf(marker)
  return index === -1 ? spawnerId : spawnerId.slice(0, index)
}

function findSettlementWolfDen(
  settlementId: string,
  spawners: readonly PreySpawner[],
): PreySpawner | undefined {
  const preferredId = `${settlementId}:wolfDen`
  return spawners.find((spawner) => spawner.id === preferredId)
    ?? spawners.find((spawner) => spawner.type === 'wolfDen' && spawner.id.startsWith(`${settlementId}:`))
}

function wolfDenOpportunity(
  settlementId: string,
  spawnerId: string,
): WolfDenPressureOpportunity {
  return {
    id: wolfDenPressureQuestId(spawnerId),
    settlementId,
    kind: 'wolf-den-pressure',
    spawnerId,
  }
}

/**
 * Detects settlement wolf-den sources as lightweight opportunity records.
 * Does not materialize a `QuestDef`. The den's deterministic spawner id is
 * enough to record a candidate even before fauna finishes booting; live
 * pressure gates offering via `wolfDenPressureSourceStatus`.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Collects world-driven candidates from authoritative fauna spawners.
 */
export function collectWolfDenPressureOpportunities(
  settlementId: string,
  spawners: readonly PreySpawner[] = [],
): WolfDenPressureOpportunity[] {
  const den = findSettlementWolfDen(settlementId, spawners)
  return [wolfDenOpportunity(settlementId, den?.id ?? `${settlementId}:wolfDen`)]
}

/**
 * Live problem status for a settlement wolf den.
 * World state owns the problem; this only classifies it for quest availability.
 *
 * @domain quests-progression
 */
export function wolfDenPressureSourceStatus(spawner: PreySpawner | undefined): Exclude<WorldQuestSourceStatus, 'untracked'> {
  if (!spawner || spawner.type !== 'wolfDen') return 'absent'
  if (isWolfDenPermanentlyDestroyed(spawner)) return 'resolved'
  if (isWolfDenPressureProblem(spawner)) return 'present'
  return 'absent'
}

export function wolfDenPressureStatusFromSpawners(
  spawnerId: string,
  spawners: readonly PreySpawner[],
): Exclude<WorldQuestSourceStatus, 'untracked'> {
  return wolfDenPressureSourceStatus(spawners.find((spawner) => spawner.id === spawnerId))
}

/**
 * Merge live candidates with persisted generated-quest ids so an accepted
 * quest can be rematerialized after the source problem changes or disappears.
 *
 * @domain quests-progression
 */
export function collectSettlementQuestOpportunities(input: {
  settlementId: string
  spawners: readonly PreySpawner[]
  persistedQuestIds?: readonly string[]
}): SettlementQuestOpportunity[] {
  const byId = new Map<string, SettlementQuestOpportunity>()
  for (const opportunity of collectWolfDenPressureOpportunities(input.settlementId, input.spawners)) {
    byId.set(opportunity.id, opportunity)
  }
  for (const questId of input.persistedQuestIds ?? []) {
    const parsed = parseWolfDenPressureQuestId(questId)
    if (!parsed) continue
    if (settlementIdFromWolfDenSpawnerId(parsed.spawnerId) !== input.settlementId) continue
    if (byId.has(questId)) continue
    byId.set(questId, {
      id: questId,
      settlementId: input.settlementId,
      kind: 'wolf-den-pressure',
      spawnerId: parsed.spawnerId,
    })
  }
  return [...byId.values()]
}
