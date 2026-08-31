import type { NeedId } from '../ai/Needs'
import type { NpcAgent, NpcInspectionSnapshot, NpcWhy, Phase } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { NpcTraceEvent } from './npcTrace'
import { pickNearestEligibleWolf } from '../fauna/AnimalAgent'
import { villageSizeConfig } from '../settlement/families'
import { isDebugMode } from './debugMode'

/**
 * Read-only registry/query layer over the authoritative NPC population
 * (plan 170 — NPC simulation inspector and trace). Never caches `NpcAgent`
 * references across calls — every lookup re-walks
 * `bundle.settlementsManager.getLoaded()` so a settlement rebuild/stream
 * cannot leave a stale reference behind (implementation notes §11).
 *
 * NPC ids are the runtime `${settlementId}:npc:${i}` identity already used
 * for interaction-queue membership (`NpcAgent.id`) — not save-stable, but
 * the only stable identity the current runtime has (implementation notes
 * §12).
 */

export type NpcRegistryEntry = { npc: NpcAgent, settlementId: string, settlementName: string }

export type NpcQueryFilter = {
  id?: string
  settlementId?: string
  need?: NeedId
  queueId?: string
  phase?: Phase
}

export type NpcQueryResult = NpcInspectionSnapshot & {
  settlementId: string
  settlementName: string
}

export type FrenzyWolfDebugResult = {
  animalId: string
  village: {
    x: number
    z: number
  }
}

function collectNpcs(bundle: WorldBundle): NpcRegistryEntry[] {
  const out: NpcRegistryEntry[] = []
  for (const settlement of bundle.settlementsManager.getLoaded()) {
    for (const npc of settlement.npcs) out.push({ npc, settlementId: settlement.id, settlementName: settlement.name })
  }
  return out
}

export function findNpcById(bundle: WorldBundle, id: string): NpcRegistryEntry | null {
  for (const entry of collectNpcs(bundle)) {
    if (entry.npc.id === id) return entry
  }
  return null
}

/** True while `npc` is still a live member of the current settlement
 *  population — used by the Ctrl+click inspector modal to detect a
 *  settlement rebuild/stream-out instead of holding on to a stale
 *  `NpcAgent` reference (implementation notes §16). */
export function isNpcRegistered(bundle: WorldBundle, npc: NpcAgent): boolean {
  for (const settlement of bundle.settlementsManager.getLoaded()) {
    if (settlement.npcs.includes(npc)) return true
  }
  return false
}

/** Pure filter predicate behind `queryNpcs` — pulled out so filtering logic
 *  is unit-testable against hand-built snapshots without a real
 *  `WorldBundle`/settlement/GLTF-loaded `NpcAgent`. */
export function matchesNpcFilter(
  snapshot: NpcInspectionSnapshot,
  settlementId: string,
  filter: NpcQueryFilter,
): boolean {
  if (filter.id && snapshot.id !== filter.id) return false
  if (filter.settlementId && settlementId !== filter.settlementId) return false
  if (filter.need && snapshot.activeNeed !== filter.need) return false
  if (filter.phase && snapshot.phase !== filter.phase) return false
  if (filter.queueId && snapshot.queue?.id !== filter.queueId) return false
  return true
}

/** Deterministic order: settlements as returned by `getLoaded()`, then each
 *  settlement's own `npcs` array — both stable, unsorted-but-consistent
 *  iteration orders already relied on elsewhere in the codebase. */
export function queryNpcs(bundle: WorldBundle, timeOfDay: number, filter: NpcQueryFilter = {}): NpcQueryResult[] {
  const out: NpcQueryResult[] = []
  for (const { npc, settlementId, settlementName } of collectNpcs(bundle)) {
    const snapshot = npc.createInspectionSnapshot(timeOfDay)
    if (!matchesNpcFilter(snapshot, settlementId, filter)) continue
    out.push({ ...snapshot, settlementId, settlementName })
  }
  return out
}

export function npcWhy(bundle: WorldBundle, timeOfDay: number, id: string): NpcWhy | null {
  return findNpcById(bundle, id)?.npc.why(timeOfDay) ?? null
}

export function npcHistory(bundle: WorldBundle, id: string): readonly NpcTraceEvent[] | null {
  return findNpcById(bundle, id)?.npc.history() ?? null
}

/** Debug controls (plan 170 §6) — every mutation goes through the NPC's own
 *  public method (never private-field access) and is rejected outright when
 *  `?debug` is off, so the mutation surface does not exist in production
 *  regardless of what a caller has a reference to. */
export function freezeNpc(bundle: WorldBundle, id: string): boolean {
  if (!isDebugMode()) return false
  const entry = findNpcById(bundle, id)
  if (!entry) return false
  entry.npc.setFrozen(true)
  return true
}

export function unfreezeNpc(bundle: WorldBundle, id: string): boolean {
  if (!isDebugMode()) return false
  const entry = findNpcById(bundle, id)
  if (!entry) return false
  entry.npc.setFrozen(false)
  return true
}

export function reevaluateNpc(bundle: WorldBundle, id: string): boolean {
  if (!isDebugMode()) return false
  const entry = findNpcById(bundle, id)
  if (!entry) return false
  entry.npc.requestReevaluation()
  return true
}

/** `setFrenzyWolf()` DevTools command (plan 179 §3/§4) — marks the nearest
 *  non-frenzied living wolf frenzied and gives it the nearest loaded village
 *  as its strategic target. Selection itself (`pickNearestEligibleWolf`) is
 *  pure/deterministic; this is only the impure glue over the live
 *  `WorldBundle` population, same "debug controls reject outright when
 *  `?debug` is off" contract as `freezeNpc`/`unfreezeNpc`/`reevaluateNpc`.
 *  Returns `false` (no mutation) when there's no eligible wolf or no loaded
 *  village — repeated calls then pick a different wolf each time since an
 *  already-frenzied one is excluded from the next selection. */
export function setFrenzyWolf(bundle: WorldBundle): FrenzyWolfDebugResult | string {
  const wolves = bundle.fauna.getAgents().filter((a) => a.def.kind === 'wolf' && !a.isDead())
  const villages = bundle.settlementsManager.getLoaded().map((s) => ({
    x: s.center.x,
    z: s.center.z,
    radius: villageSizeConfig(s.size).footprintRadius,
  }))
  const picked = pickNearestEligibleWolf(
    wolves.map((w) => ({ animalId: w.animalId, x: w.mesh.position.x, z: w.mesh.position.z, frenzied: w.isFrenzied() })),
    villages,
  )

  if (!picked) return 'No eligible wolf found'

  const wolf = wolves.find((w) => w.animalId === picked.animalId)
  if (!wolf) return 'No wolf found'

  wolf.setFrenzied(picked.village)

  return {
    animalId: wolf.animalId,
    village: {
      x: picked.village.x,
      z: picked.village.z,
    },
  }
}
