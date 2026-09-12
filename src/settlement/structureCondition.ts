import type { MaterialRequirement } from '../items/constructionMaterials'
import type { VillageBuildingRole } from './villagePlan'
import {
  applyConditionDelta,
  checkpointCondition,
  clampCondition,
  CONDITION_MAX,
  resolveCondition,
} from '../world/condition'
import { applyRepairWork, isRepairComplete, type RepairProgress } from '../world/repair'

/**
 * Settlement structure condition/repair — the shared, actor-neutral V1
 * lifecycle for settlement-plan buildings (plan settlements-007). Reuses
 * `world/condition.ts` (`0..100` condition math) and `world/repair.ts`
 * (actor-neutral work progress) exactly as the landed well-roof repair flow
 * does — this module owns only the settlement-structure policy/transaction
 * layer on top, not new math. NPC and player repair both go through the
 * same `quoteStructureRepair` / `beginStructureRepair` /
 * `applyStructureRepairWork` transaction; a material-source adapter
 * (`hasMaterial`/`consumeMaterial` callbacks) is the only actor-specific
 * seam.
 *
 * @domain settlements
 */

/** Persisted/runtime mutable state for one settlement-plan building, keyed by
 *  its stable `VillageBuildingPlan.id` (never mesh/runtime identity). Absent
 *  from the owning registry means pristine (`condition = 100`, no repair) —
 *  see `pristineStructureState`. */
export type SettlementStructureState = {
  structureId: string
  settlementId: string
  condition: number
  lastConditionUpdateAtDays: number
  repair?: RepairProgress
}

/** Fresh pristine state — the resolved default whenever no mutation record
 *  exists yet for a known `VillageBuildingPlan.id` (sparse-persistence
 *  contract, implementation notes §4). */
export function pristineStructureState(
  settlementId: string,
  structureId: string,
  nowDays: number,
): SettlementStructureState {
  return {
    structureId,
    settlementId,
    condition: CONDITION_MAX,
    lastConditionUpdateAtDays: nowDays,
  }
}

export function hasActiveStructureRepair(state: SettlementStructureState): boolean {
  return state.repair !== undefined
}

/** Small data-only repair policy per repairable `VillageBuildingRole` (plan
 *  §2) — the single place structure repair cost/threshold constants live,
 *  instead of being re-derived in NPC/player/quest code. V1 only maps
 *  `residential`; other roles opt in later without a second repair system. */
export type StructureRepairPolicy = {
  label: string
  /** Resolved condition at/below this counts as a repair problem
   *  (`isStructureRepairProblem`) — independent of `quoteStructureRepair`,
   *  which allows topping off any condition below `targetCondition`. */
  repairThreshold: number
  targetCondition: number
  /** Relative maintenance/pressure weight (plan §5's NPC pressure input) —
   *  higher means this role's damage matters more when several candidates
   *  compete for the same NPC's attention. */
  importanceWeight: number
  materialsForRestoredFraction: (fraction: number) => readonly MaterialRequirement[]
  requiredWorkForRestoredFraction: (fraction: number) => number
}

/** Cheaper than a from-scratch residential build (`RESIDENTIAL_BUILDING_DEFINITIONS`'s
 *  `structure`+`roof` stages combined) but still a real cost — same spirit as
 *  `WELL_ROOF_REPAIR_COST_FACTOR`. A full (100%) restoration costs this many
 *  beams/branches and this many work hours; partial restoration scales down. */
const RESIDENTIAL_STRUCTURE_FULL_REPAIR_BEAMS = 4
const RESIDENTIAL_STRUCTURE_FULL_REPAIR_BRANCHES = 4
const RESIDENTIAL_STRUCTURE_FULL_REPAIR_WORK_HOURS = 3

const RESIDENTIAL_STRUCTURE_REPAIR_POLICY: StructureRepairPolicy = {
  label: 'Chata',
  repairThreshold: 50,
  targetCondition: CONDITION_MAX,
  importanceWeight: 1,
  materialsForRestoredFraction: (fraction) => {
    if (fraction <= 0) return []
    const requirements: MaterialRequirement[] = []
    const beams = Math.max(1, Math.round(RESIDENTIAL_STRUCTURE_FULL_REPAIR_BEAMS * fraction))
    const branches = Math.max(1, Math.round(RESIDENTIAL_STRUCTURE_FULL_REPAIR_BRANCHES * fraction))
    requirements.push({ kind: 'beam', count: beams })
    requirements.push({ kind: 'branch', count: branches })
    return requirements
  },
  requiredWorkForRestoredFraction: (fraction) => RESIDENTIAL_STRUCTURE_FULL_REPAIR_WORK_HOURS * fraction,
}

/** `null` for a `VillageBuildingRole` with no repair adapter yet (plan §5 —
 *  V1 only implements `residential`). */
export function structureRepairPolicy(role: VillageBuildingRole): StructureRepairPolicy | null {
  return role === 'residential' ? RESIDENTIAL_STRUCTURE_REPAIR_POLICY : null
}

/** Repair pressure never exceeds this — well under a typical urgent-need
 *  score, so ordinary structure maintenance loses to critical needs/severe
 *  weather/healing on scale alone (plan §5's priority expectations); it is
 *  never wired as a critical interrupt either way. */
const STRUCTURE_REPAIR_PRESSURE_CAP = 0.55

/** Held once a repair episode is already active (plan §5) — keeps an
 *  in-progress repair outranking ordinary idle/work so it does not get
 *  abandoned mid-episode the moment another ordinary pressure edges it out
 *  for a single tick. Still well under a critical-need score. */
export const STRUCTURE_REPAIR_RESUME_PRESSURE = 0.5

/**
 * Pure repair-pressure score from a resolved condition (plan §5) — `0` at or
 * above `policy.repairThreshold`, scaling with how far below it the
 * structure has fallen. Callers with an active repair episode should use
 * `STRUCTURE_REPAIR_RESUME_PRESSURE` instead of calling this.
 *
 * @domain settlements
 */
export function structureRepairPressureFromCondition(condition: number, policy: StructureRepairPolicy): number {
  const deficit = (policy.repairThreshold - condition) / policy.repairThreshold
  if (deficit <= 0) return 0
  return Math.min(STRUCTURE_REPAIR_PRESSURE_CAP, deficit * policy.importanceWeight)
}

/** No passive/weather decay source is wired in V1 (plan §4 — damage is an
 *  explicit `applyStructureDamage` call only), so lazy resolution never loses
 *  condition on its own; the shared `resolveCondition` contract stays the
 *  single seam future weather/wear sources plug into (plan §10) without
 *  callers changing. Active repair freezes at the checkpointed
 *  `startedCondition`, same as the well roof. */
export function resolveStructureCondition(state: SettlementStructureState, nowDays: number): number {
  if (hasActiveStructureRepair(state)) return clampCondition(state.condition)
  return resolveCondition({
    state: { condition: state.condition, lastConditionUpdateAtDays: state.lastConditionUpdateAtDays },
    nowDays,
    decay: {},
  })
}

/** True once resolved condition has crossed the role's repair threshold —
 *  the derived "problem exists" signal (plan §4); never a persisted flag. */
export function isStructureRepairProblem(
  policy: StructureRepairPolicy,
  state: SettlementStructureState,
  nowDays: number,
): boolean {
  return resolveStructureCondition(state, nowDays) <= policy.repairThreshold
}

/**
 * Explicit condition-mutation seam (plan §4) — the single entry point future
 * weather/attack/fire/wear sources call, and the test/debug fixture uses to
 * damage a structure without a quest-specific flag. A no-op while a repair
 * episode is active (V1 does not define concurrent damage semantics —
 * implementation notes §13).
 *
 * @domain settlements
 */
export function applyStructureDamage(
  state: SettlementStructureState,
  amount: number,
  nowDays: number,
): SettlementStructureState {
  if (hasActiveStructureRepair(state) || amount <= 0) return state
  const resolved = resolveStructureCondition(state, nowDays)
  const checkpointed = checkpointCondition(resolved, nowDays)
  return {
    ...state,
    condition: applyConditionDelta(checkpointed.condition, -amount),
    lastConditionUpdateAtDays: checkpointed.lastConditionUpdateAtDays,
  }
}

export type StructureRepairQuote = {
  currentCondition: number
  targetCondition: number
  materials: readonly MaterialRequirement[]
  requiredWork: number
}

function restoredFraction(currentCondition: number, targetCondition: number): number {
  return (targetCondition - currentCondition) / CONDITION_MAX
}

/**
 * Derived, read-only repair quote — `null` when an episode is already active
 * or `targetCondition` is not a legal improvement of the resolved current
 * condition (already at/above it). Mirrors `quoteWellRoofRepair`. Does not
 * mutate `state`.
 *
 * @domain settlements
 */
export function quoteStructureRepair(
  policy: StructureRepairPolicy,
  state: SettlementStructureState,
  nowDays: number,
  targetCondition: number = policy.targetCondition,
): StructureRepairQuote | null {
  if (hasActiveStructureRepair(state)) return null
  const currentCondition = resolveStructureCondition(state, nowDays)
  if (!(currentCondition < targetCondition && targetCondition <= CONDITION_MAX)) return null
  const fraction = restoredFraction(currentCondition, targetCondition)
  return {
    currentCondition,
    targetCondition,
    materials: policy.materialsForRestoredFraction(fraction),
    requiredWork: policy.requiredWorkForRestoredFraction(fraction),
  }
}

export type StructureRepairStartOutcome =
  | { status: 'started', quote: StructureRepairQuote, state: SettlementStructureState }
  | { status: 'blocked', missing: readonly MaterialRequirement[] }
  | { status: 'unavailable' }

/**
 * Authoritative start-repair transaction (plan §3) — read-only quote +
 * atomic material preflight run first; condition is checkpointed and the
 * episode created only once every requirement is confirmed available.
 * `hasMaterial`/`consumeMaterial` are the material-source adapter: player
 * `Inventory`, an owning `Household`'s items, or a settlement stock, per
 * caller. Resume (an already-active `state.repair`) never reaches here —
 * callers should route straight to `applyStructureRepairWork` instead.
 *
 * @domain settlements
 */
export function beginStructureRepair(params: {
  policy: StructureRepairPolicy
  state: SettlementStructureState
  nowDays: number
  targetCondition?: number
  hasMaterial: (requirement: MaterialRequirement) => boolean
  consumeMaterial: (requirement: MaterialRequirement) => void
}): StructureRepairStartOutcome {
  const { consumeMaterial, hasMaterial, nowDays, policy, state } = params
  const targetCondition = params.targetCondition ?? policy.targetCondition
  const quote = quoteStructureRepair(policy, state, nowDays, targetCondition)
  if (!quote) return { status: 'unavailable' }
  const missing = quote.materials.filter((requirement) => !hasMaterial(requirement))
  if (missing.length > 0) return { status: 'blocked', missing }
  for (const requirement of quote.materials) consumeMaterial(requirement)
  const checkpointed = checkpointCondition(quote.currentCondition, nowDays)
  const repair: RepairProgress = {
    startedCondition: checkpointed.condition,
    targetCondition: quote.targetCondition,
    requiredWork: quote.requiredWork,
    completedWork: 0,
  }
  return {
    status: 'started',
    quote,
    state: {
      ...state,
      condition: checkpointed.condition,
      lastConditionUpdateAtDays: checkpointed.lastConditionUpdateAtDays,
      repair,
    },
  }
}

export type StructureRepairWorkOutcome = {
  state: SettlementStructureState
  acceptedWork: number
  completed: boolean
}

/**
 * Apply an actor-neutral work contribution to an active repair episode — the
 * same seam player `BusyAction` sessions and NPC work bouts both call.
 * Completion writes `targetCondition`, clears the episode, and resets the
 * condition anchor to `nowDays`. A no-op (0 accepted) when no episode is
 * active. Does not mutate `state`.
 *
 * @domain settlements
 */
export function applyStructureRepairWork(
  state: SettlementStructureState,
  workAmount: number,
  nowDays: number,
): StructureRepairWorkOutcome {
  if (!state.repair) return { state, acceptedWork: 0, completed: false }
  const { acceptedWork, progress } = applyRepairWork(state.repair, workAmount)
  if (!isRepairComplete(progress)) {
    return { state: { ...state, repair: progress }, acceptedWork, completed: false }
  }
  const next: SettlementStructureState = {
    ...state,
    condition: progress.targetCondition,
    lastConditionUpdateAtDays: nowDays,
  }
  delete next.repair
  return { state: next, acceptedWork, completed: true }
}

/** One repair work-session bout (plan settlements-007) — same capped shape
 *  as `WELL_WORK_SESSION_SEC`/`WELL_WORK_SESSION_HOURS`: a structure's full
 *  repair requirement is reached over several repeated bouts, never one long
 *  frozen busy channel. */
export const STRUCTURE_REPAIR_WORK_SESSION_SEC = 8
export const STRUCTURE_REPAIR_WORK_SESSION_HOURS = 1

export function structureConditionStateFromSnapshot(
  settlementId: string,
  structureId: string,
  snapshot: Pick<SettlementStructureState, 'condition' | 'lastConditionUpdateAtDays' | 'repair'>,
): SettlementStructureState {
  return {
    structureId,
    settlementId,
    condition: clampCondition(snapshot.condition),
    lastConditionUpdateAtDays: snapshot.lastConditionUpdateAtDays,
    repair: snapshot.repair,
  }
}
