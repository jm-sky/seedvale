import type { NeedId } from '../ai/Needs'
import type { NpcAgent, NpcInspectionSnapshot, NpcWhy, Phase } from '../ai/NpcAgent'
import type { WorldBundle } from '../app/worldBundle'
import type { HouseholdHistoryEvent } from './householdHistory'
import type { NpcTraceEvent } from './npcTrace'
import type { SettlementHistoryEvent } from './settlementHistory'
import { pickNearestEligibleWolf } from '../fauna/AnimalAgent'
import { villageSizeConfig } from '../settlement/families'
import { type HouseholdId, householdIdFor } from '../settlement/household'
import { isDebugMode } from './debugMode'
import { filterHistory, type HistoryFilter } from './domainHistory'
import { findVillageDef } from './villageInspector'

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
 *
 * Also owns the hierarchical household/settlement history aggregation (plan
 * settlements-npcs-013) — see `householdHistory`/`settlementHistory` below.
 * Household/settlement lookups re-resolve through
 * `SettlementsManager.getHousehold`/`getEconomy` on every call, same
 * "never cache a reference" contract as the NPC lookups above; both
 * `Household` and `SettlementEconomy` are registry-owned and survive
 * settlement unload/reload, unlike the `NpcAgent`/`Settlement` instances
 * they're built alongside.
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

export function npcHistory(bundle: WorldBundle, id: string, filter?: HistoryFilter): readonly NpcTraceEvent[] | null {
  const history = findNpcById(bundle, id)?.npc.history()
  if (!history) return null
  return filter ? filterHistory(history, filter) : history
}

/** `debug.household(id).history()` — the household's own bounded mutation
 *  history (`Household.history()`), unmodified. Deliberately *not* merged
 *  with member NPCs' traces here: a resource mutation caused by an NPC
 *  action is a distinct household-owned event from the NPC's own decision/
 *  action record (implementation notes) — see `settlementHistory` below for
 *  the merged cross-scope view. `null` for an id that has never been
 *  created (settlement never built), not just currently unloaded. */
export function householdHistory(
  bundle: WorldBundle,
  id: HouseholdId,
  filter?: HistoryFilter,
): readonly HouseholdHistoryEvent[] | null {
  const history = bundle.settlementsManager.getHousehold(id)?.history()
  if (!history) return null
  return filter ? filterHistory(history, filter) : history
}

/** One entry of `settlementHistory`'s merged timeline — a thin envelope
 *  around an already-typed domain event (`NpcTraceEvent` /
 *  `HouseholdHistoryEvent` / `SettlementHistoryEvent`), not a new untyped
 *  event shape (plan settlements-npcs-013's "do not replace the typed union"
 *  constraint). `type`/`simTime` are hoisted for convenient
 *  filtering/display; `seq` is `null` for `npc` scope — the NPC trace has no
 *  sequence counter of its own (see the ordering comment on
 *  `settlementHistory`). */
export type DomainHistoryEnvelope =
  | {
      scope: 'npc'
      type: NpcTraceEvent['type']
      simTime: number
      seq: null
      npcId: string
      householdId: string | null
      settlementId: string
      event: NpcTraceEvent
    }
  | {
      scope: 'household'
      type: HouseholdHistoryEvent['type']
      simTime: number
      seq: number
      householdId: string
      settlementId: string
      event: HouseholdHistoryEvent
    }
  | {
      scope: 'settlement'
      type: SettlementHistoryEvent['type']
      simTime: number
      seq: number
      settlementId: string
      event: SettlementHistoryEvent
    }

const SCOPE_RANK: Record<DomainHistoryEnvelope['scope'], number> = { npc: 0, household: 1, settlement: 2 }

/** Pure merge-sort step behind `settlementHistory` below — pulled out so
 *  ordering/determinism is unit-testable against hand-built envelopes
 *  without a `WorldBundle`/settlement (plan settlements-npcs-013's "prefer
 *  pure history-buffer/aggregation tests" guidance). Mutates and returns
 *  `envelopes` in place; see `settlementHistory`'s doc for the ordering
 *  rules themselves. */
export function sortDomainHistory(envelopes: DomainHistoryEnvelope[]): DomainHistoryEnvelope[] {
  return envelopes.sort(
    (a, b) => a.simTime - b.simTime || SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || (a.seq ?? -1) - (b.seq ?? -1),
  )
}

/** `debug.settlement(id).history()` — merges this settlement's own economy
 *  history, every one of its households' history (resolved by
 *  `def.families.length`, so an unloaded settlement's households still
 *  contribute if they were ever created), and — only while the settlement is
 *  currently loaded — its live NPCs' traces (plan settlements-npcs-013 §5:
 *  "a settlement history assembled from child NPC traces can only include
 *  currently-loaded NPC trace history").
 *
 * Ordering: primarily `simTime`; ties break by scope (`npc` before
 * `household` before `settlement`) then by `seq`. Household/settlement
 * events are stamped with the triggering `NpcAgent`'s own `simClock` at
 * every current mutation site, so a causal chain (NPC decision → household
 * mutation it triggers) shares one clock and interleaves correctly; `seq`
 * is a local per-buffer monotonic counter (not a cross-domain allocator,
 * see `domainHistory.ts`), which combined with the fixed scope order and
 * `Array.sort`'s stability gives a fully deterministic merge without a
 * shared global event bus/sequence source.
 *
 * `null` for an id with no resolvable `SettlementDef` (not a real
 * settlement); `[]` (not `null`) for one that resolves but has never been
 * built. */
export function settlementHistory(
  bundle: WorldBundle,
  id: string,
  filter?: HistoryFilter,
): readonly DomainHistoryEnvelope[] | null {
  const def = findVillageDef(bundle.settlementsManager, id)
  if (!def) return null

  const envelopes: DomainHistoryEnvelope[] = []

  const economy = bundle.settlementsManager.getEconomy(id)
  if (economy) {
    for (const event of economy.history()) {
      envelopes.push({ scope: 'settlement', type: event.type, simTime: event.simTime, seq: event.seq, settlementId: id, event })
    }
  }

  for (let familyIndex = 0; familyIndex < def.families.length; familyIndex++) {
    const householdId = householdIdFor(id, familyIndex)
    const household = bundle.settlementsManager.getHousehold(householdId)
    if (!household) continue
    for (const event of household.history()) {
      envelopes.push({
        scope: 'household',
        type: event.type,
        simTime: event.simTime,
        seq: event.seq,
        householdId,
        settlementId: id,
        event,
      })
    }
  }

  const loaded = bundle.settlementsManager.getLoaded().find((s) => s.id === id)
  if (loaded) {
    for (const npc of loaded.npcs) {
      for (const event of npc.history()) {
        envelopes.push({
          scope: 'npc',
          type: event.type,
          simTime: event.simTime,
          seq: null,
          npcId: npc.id,
          householdId: npc.household?.id ?? null,
          settlementId: id,
          event,
        })
      }
    }
  }

  sortDomainHistory(envelopes)

  return filter ? filterHistory(envelopes, filter) : envelopes
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
