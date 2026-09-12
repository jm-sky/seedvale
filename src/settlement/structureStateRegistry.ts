import type { MaterialRequirement } from '../items/constructionMaterials'
import type { SettlementStructureState, StructureRepairPolicy, StructureRepairStartOutcome } from './structureCondition'
import {
  applyStructureRepairWork,
  beginStructureRepair,
  pristineStructureState,
  structureConditionStateFromSnapshot,
} from './structureCondition'

/**
 * Settlement-owned, manager-lifetime registry of mutable structure condition/
 * repair state (plan settlements-007) — same ownership shape as
 * `HouseholdRegistry`/`EconomyRegistry`/rat infestation state: lives on
 * `SettlementsManager`, survives settlement stream-out/in and in-session
 * `WorldBundle` rebuilds, and is the only authoritative place mutable
 * condition data is stored. `VillagePlan`/`SettlementDef` stay immutable —
 * they only supply the stable `VillageBuildingPlan.id` this registry keys on.
 *
 * A structure with no stored record is pristine (`condition = 100`, no
 * active repair) — sparse persistence, resolved fresh on every `resolve()`
 * call rather than eagerly materialized for every building.
 *
 * @domain settlements
 * @system structure-condition
 * @role Owns mutable settlement-structure condition/repair state, keyed by stable structureId.
 * @owns SettlementStructureState
 */
export type SettlementStructureStateRegistry = {
  /** Fresh-resolving lookup — a pristine default when no mutation record
   *  exists yet, otherwise the stored record with lazily resolved condition
   *  (currently a no-op resolve in V1 — no decay source is wired). Never
   *  itself stores the pristine default. */
  resolve: (settlementId: string, structureId: string, nowDays: number) => SettlementStructureState
  /** Raw stored record, or `undefined` when the structure has never been
   *  mutated — used by `set` callers that already resolved a fresh snapshot
   *  and want to confirm what is currently persisted. */
  get: (settlementId: string, structureId: string) => SettlementStructureState | undefined
  /** Replaces the stored record for `state.settlementId`/`state.structureId`. */
  set: (state: SettlementStructureState) => void
  /** Every stored (i.e. non-pristine) record for one settlement — bounded by
   *  how many structures were ever damaged/repaired, not by total building
   *  count. */
  listForSettlement: (settlementId: string) => readonly SettlementStructureState[]
  clear: () => void
  /** Save-schema snapshot — sparse, one entry per mutated structure. */
  serialize: () => Record<string, SettlementStructureState>
}

/**
 * Shared begin-repair transaction against a registry — the single glue both
 * `SettlementsManager.beginStructureRepair` (player) and the per-NPC
 * structure-repair hooks (`structureRepairCandidates.ts`) call, so the
 * resolve/mutate/store sequence is never duplicated between actors.
 *
 * @domain settlements
 */
export function beginRegistryStructureRepair(
  registry: SettlementStructureStateRegistry,
  policy: StructureRepairPolicy,
  settlementId: string,
  structureId: string,
  nowDays: number,
  hasMaterial: (requirement: MaterialRequirement) => boolean,
  consumeMaterial: (requirement: MaterialRequirement) => void,
  targetCondition?: number,
): StructureRepairStartOutcome {
  const state = registry.resolve(settlementId, structureId, nowDays)
  const outcome = beginStructureRepair({ policy, state, nowDays, targetCondition, hasMaterial, consumeMaterial })
  if (outcome.status === 'started') registry.set(outcome.state)
  return outcome
}

/** Shared work-contribution transaction against a registry — see
 *  `beginRegistryStructureRepair`'s doc comment for why this is the one glue
 *  implementation. */
export function contributeRegistryStructureRepairWork(
  registry: SettlementStructureStateRegistry,
  settlementId: string,
  structureId: string,
  workAmount: number,
  nowDays: number,
): { acceptedWork: number, completed: boolean } {
  const state = registry.resolve(settlementId, structureId, nowDays)
  const outcome = applyStructureRepairWork(state, workAmount, nowDays)
  if (outcome.acceptedWork > 0) registry.set(outcome.state)
  return { acceptedWork: outcome.acceptedWork, completed: outcome.completed }
}

function registryKey(settlementId: string, structureId: string): string {
  return `${settlementId}:structure:${structureId}`
}

export function createSettlementStructureStateRegistry(
  initial?: Record<string, SettlementStructureState>,
): SettlementStructureStateRegistry {
  const byKey = new Map<string, SettlementStructureState>()
  if (initial) {
    for (const [key, snapshot] of Object.entries(initial)) {
      if (!snapshot) continue
      byKey.set(key, structureConditionStateFromSnapshot(snapshot.settlementId, snapshot.structureId, snapshot))
    }
  }
  return {
    resolve(settlementId, structureId, nowDays) {
      const stored = byKey.get(registryKey(settlementId, structureId))
      return stored ?? pristineStructureState(settlementId, structureId, nowDays)
    },
    get(settlementId, structureId) {
      return byKey.get(registryKey(settlementId, structureId))
    },
    set(state) {
      byKey.set(registryKey(state.settlementId, state.structureId), state)
    },
    listForSettlement(settlementId) {
      const prefix = `${settlementId}:structure:`
      const out: SettlementStructureState[] = []
      for (const [key, state] of byKey) {
        if (key.startsWith(prefix)) out.push(state)
      }
      return out
    },
    clear() {
      byKey.clear()
    },
    serialize() {
      const out: Record<string, SettlementStructureState> = {}
      for (const [key, state] of byKey) out[key] = state
      return out
    },
  }
}
