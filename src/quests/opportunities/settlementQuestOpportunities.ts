import type { PreySpawner } from '../../fauna/AnimalSpawner'
import type {
  LostLivestockOpportunity,
  SettlementQuestOpportunity,
  WolfDenPressureOpportunity,
  WorldQuestSourceStatus,
} from './worldQuestOpportunityTypes'
import {
  isStrayEpisodeActive,
  type LivestockStrayCandidate,
  selectLostLivestock,
} from '../../fauna/animalStray'
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
const LOST_LIVESTOCK_PREFIX = 'world:lost-livestock:'

export const LOST_LIVESTOCK_LIVE_OUTCOME = 'live_return'
export const LOST_LIVESTOCK_DEAD_OUTCOME = 'dead_confirmed'
export const LOST_LIVESTOCK_UNAVAILABLE_OUTCOME = 'unavailable'

/**
 * Stable generated quest/opportunity id. Deterministic from settlement +
 * existing livestock identity — never a runtime UUID.
 *
 * @domain quests-progression
 */
export function lostLivestockQuestId(settlementId: string, animalId: string): string {
  return `${LOST_LIVESTOCK_PREFIX}${settlementId}:${animalId}`
}

export function parseLostLivestockQuestId(questId: string): { settlementId: string, animalId: string } | null {
  if (!questId.startsWith(LOST_LIVESTOCK_PREFIX)) return null
  const rest = questId.slice(LOST_LIVESTOCK_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator <= 0 || separator === rest.length - 1) return null
  return { settlementId: rest.slice(0, separator), animalId: rest.slice(separator + 1) }
}

function lostLivestockOpportunity(
  settlementId: string,
  houseId: string,
  animalId: string,
): LostLivestockOpportunity {
  return {
    id: lostLivestockQuestId(settlementId, animalId),
    settlementId,
    kind: 'lost-livestock',
    houseId,
    animalId,
  }
}

/**
 * Detects one existing household livestock source as a lightweight candidate.
 * Prefers an already-active stray episode, otherwise a deterministic eligible pick.
 *
 * @domain quests-progression
 */
export function collectLostLivestockOpportunities(
  settlementId: string,
  livestock: readonly LivestockStrayCandidate[] = [],
): LostLivestockOpportunity[] {
  const local = livestock.filter((candidate) => candidate.settlementId === settlementId)
  const active = local.find((candidate) => isStrayEpisodeActive(candidate.stray))
  if (active && active.owner?.kind === 'household') {
    return [lostLivestockOpportunity(settlementId, active.owner.houseId, active.animalId)]
  }
  const selected = selectLostLivestock(local, settlementId)
  if (!selected || selected.owner?.kind !== 'household') return []
  return [lostLivestockOpportunity(settlementId, selected.owner.houseId, selected.animalId)]
}

export function collectSettlementQuestOpportunities(input: {
  settlementId: string
  spawners: readonly PreySpawner[]
  persistedQuestIds?: readonly string[]
  livestock?: readonly LivestockStrayCandidate[]
}): SettlementQuestOpportunity[] {
  const byId = new Map<string, SettlementQuestOpportunity>()
  for (const opportunity of collectWolfDenPressureOpportunities(input.settlementId, input.spawners)) {
    byId.set(opportunity.id, opportunity)
  }
  for (const opportunity of collectLostLivestockOpportunities(input.settlementId, input.livestock)) {
    byId.set(opportunity.id, opportunity)
  }
  for (const questId of input.persistedQuestIds ?? []) {
    const wolf = parseWolfDenPressureQuestId(questId)
    if (wolf) {
      if (settlementIdFromWolfDenSpawnerId(wolf.spawnerId) !== input.settlementId) continue
      if (byId.has(questId)) continue
      byId.set(questId, {
        id: questId,
        settlementId: input.settlementId,
        kind: 'wolf-den-pressure',
        spawnerId: wolf.spawnerId,
      })
      continue
    }
    const lost = parseLostLivestockQuestId(questId)
    if (!lost) continue
    if (lost.settlementId !== input.settlementId) continue
    if (byId.has(questId)) continue
    const record = (input.livestock ?? []).find((candidate) => candidate.animalId === lost.animalId)
    const houseId = record?.owner?.kind === 'household' ? record.owner.houseId : `${input.settlementId}:home:0`
    byId.set(questId, {
      id: questId,
      settlementId: input.settlementId,
      kind: 'lost-livestock',
      houseId,
      animalId: lost.animalId,
    })
  }
  return [...byId.values()]
}
