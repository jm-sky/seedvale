import type { MaterialRequirement } from '../items/constructionMaterials'
import type { Settlement } from './createSettlement'
import type { SettlementStructureState, StructureRepairStartOutcome } from './structureCondition'
import type { SettlementStructureStateRegistry } from './structureStateRegistry'
import {
  hasActiveStructureRepair,
  isStructureRepairProblem,
  quoteStructureRepair,
  resolveStructureCondition,
  STRUCTURE_REPAIR_RESUME_PRESSURE,
  structureRepairPolicy,
  structureRepairPressureFromCondition,
} from './structureCondition'
import { beginRegistryStructureRepair, contributeRegistryStructureRepairWork } from './structureStateRegistry'
import { residentialStructureId } from './villagePlan'

/**
 * Bounded local repair-candidate lookup over one *loaded* settlement's own
 * residential houses (plan settlements-007 §5/§10) — the settlement/registry
 * already know their own structures, so `NpcAgent` never scans
 * `VillagePlan`/Three.js itself. `landmarks.houses[i]` / `households[i]` are
 * both index-aligned with the family list (`props.ts`/`createSettlement.ts`
 * convention), the same order `residentialStructureId(i)` assumes.
 *
 * @domain settlements
 */
export type ResidentialRepairCandidate = {
  structureId: string
  settlementId: string
  position: { x: number, y: number, z: number }
  condition: number
  repairActive: boolean
  /** The owning household, when this settlement has one at that family index. */
  householdId: string | null
}

/** Every currently-damaged residential house in `settlement` — small (one
 *  entry per house, never per-frame-recomputed by callers beyond their own
 *  decision tick). `null` policy (a role V1 does not adapt yet) short-circuits
 *  to an empty list. */
export function residentialRepairCandidates(
  settlement: Pick<Settlement, 'households' | 'id' | 'landmarks'>,
  registry: SettlementStructureStateRegistry,
  nowDays: number,
): readonly ResidentialRepairCandidate[] {
  const policy = structureRepairPolicy('residential')
  if (!policy) return []
  const candidates: ResidentialRepairCandidate[] = []
  const houses = settlement.landmarks.houses
  for (let i = 0; i < houses.length; i++) {
    const house = houses[i]!
    const structureId = residentialStructureId(i)
    const state = registry.resolve(settlement.id, structureId, nowDays)
    if (!isStructureRepairProblem(policy, state, nowDays)) continue
    candidates.push({
      structureId,
      settlementId: settlement.id,
      position: { x: house.position.x, y: house.position.y, z: house.position.z },
      condition: resolveStructureCondition(state, nowDays),
      repairActive: hasActiveStructureRepair(state),
      householdId: settlement.households[i]?.id ?? null,
    })
  }
  return candidates
}

/**
 * Per-NPC structure-repair hooks (plan settlements-007 §5/§11) — deliberately
 * narrower than `residentialRepairCandidates` above: V1 only lets an NPC
 * repair its *own* household's house (the ownership input the plan's
 * pressure section calls for), so this binds one stable structureId/position
 * pair at `NpcAgent.create()` time instead of handing the NPC a settlement-
 * wide scan. `null` when this settlement has no residential repair policy or
 * no house at `familyIndex` (never true for a real family, but keeps the
 * hook total for tests/fixtures).
 *
 * @domain settlements
 */
export type NpcStructureRepairHooks = {
  settlementId: string
  structureId: string
  position: { x: number, y: number, z: number }
  getSnapshot: (nowDays: number) => SettlementStructureState
  isRepairProblem: (nowDays: number) => boolean
  /** Pure repair-pressure score for `NpcAgent.choose()`'s arbitration (plan
   *  §5) — `STRUCTURE_REPAIR_RESUME_PRESSURE` while an episode is active,
   *  otherwise `structureRepairPressureFromCondition`, `0` above threshold. */
  pressure: (nowDays: number, hasMaterial: (requirement: MaterialRequirement) => boolean) => number
  beginRepair: (
    nowDays: number,
    hasMaterial: (requirement: MaterialRequirement) => boolean,
    consumeMaterial: (requirement: MaterialRequirement) => void,
  ) => StructureRepairStartOutcome
  contributeWork: (hours: number, nowDays: number) => { acceptedWork: number, completed: boolean }
}

export function createNpcStructureRepairHooks(
  settlementId: string,
  familyIndex: number,
  housePosition: { x: number, y: number, z: number } | undefined,
  registry: SettlementStructureStateRegistry,
): NpcStructureRepairHooks | null {
  const policy = structureRepairPolicy('residential')
  if (!policy || !housePosition) return null
  const structureId = residentialStructureId(familyIndex)
  return {
    settlementId,
    structureId,
    position: housePosition,
    getSnapshot: (nowDays) => registry.resolve(settlementId, structureId, nowDays),
    isRepairProblem: (nowDays) => isStructureRepairProblem(policy, registry.resolve(settlementId, structureId, nowDays), nowDays),
    pressure: (nowDays, hasMaterial) => {
      const state = registry.resolve(settlementId, structureId, nowDays)
      if (hasActiveStructureRepair(state)) return STRUCTURE_REPAIR_RESUME_PRESSURE
      const quote = quoteStructureRepair(policy, state, nowDays)
      if (!quote) return 0
      if (quote.materials.some((requirement) => !hasMaterial(requirement))) return 0
      return structureRepairPressureFromCondition(resolveStructureCondition(state, nowDays), policy)
    },
    beginRepair: (nowDays, hasMaterial, consumeMaterial) =>
      beginRegistryStructureRepair(registry, policy, settlementId, structureId, nowDays, hasMaterial, consumeMaterial),
    contributeWork: (hours, nowDays) => contributeRegistryStructureRepairWork(registry, settlementId, structureId, hours, nowDays),
  }
}
