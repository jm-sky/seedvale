import type { EconomyRegistry } from '../economy/registry'
import type { ExpeditionAssignment } from '../world/expeditionAssignment'
import type { HouseholdRegistry, HouseholdSnapshot } from './household'
import type { NpcAuthoritativeState, NpcId } from './npcState'
import { observeNpcTravelArrival } from '../ai/npcTravel'
import { isTentItemInstance } from '../items/itemInstances'
import {
  foundedHouseholdId,
  foundedSettlementId,
  type FoundedSettlementRecord,
  type FoundedSettlementRegistry,
  foundedTentId,
} from './foundedSettlement'

/** Reusable operation input (plan settlements-003 §"Bootstrap API") — the
 *  caller (a quest/consumer) selects the expedition and validates
 *  site-readiness; this transaction never chooses either. */
export type BootstrapFoundedSettlementInput = {
  /** Stable destination/site id — the founded settlement id is derived from
   *  this, never randomized. */
  siteId: string
  x: number
  z: number
  sponsorSettlementId: string
  /** Only `id`/`memberNpcIds` are read — this transaction never advances or
   *  reselects the assignment itself. */
  assignment: Pick<ExpeditionAssignment, 'id' | 'memberNpcIds'>
  /** Caller-validated site-readiness result (plan world-019's
   *  `querySiteInfrastructure` + the caller's own policy). This transaction
   *  does not hard-code readiness thresholds. */
  siteReady: boolean
  nowDays: number
}

export type BootstrapFoundedSettlementFailureReason =
  | 'site-not-ready'
  | 'missing-npc-state'
  | 'member-dead'
  | 'not-travelling-for-this-assignment'
  | 'travel-blocked'
  | 'not-arrived'
  | 'missing-tent-instance'

export type BootstrapFoundedSettlementResult =
  | { status: 'created', settlementId: string }
  | { status: 'existing', settlementId: string }
  | { status: 'not_ready', reason: BootstrapFoundedSettlementFailureReason }

/** Minimal `PlacedTents` slice this transaction needs — narrower than the
 *  full type so unit tests don't need a real `Scene`/`HeightSampler`. */
export type FoundedSettlementTentsDeps = {
  get: (id: string) => { id: string } | null
  place: (
    x: number,
    z: number,
    yaw: number,
    worldDays: number,
    from?: { id: string, condition: number },
  ) => unknown
}

export type BootstrapFoundedSettlementDeps = {
  founded: FoundedSettlementRegistry
  getNpcState: (id: NpcId) => NpcAuthoritativeState | undefined
  households: HouseholdRegistry
  economies: EconomyRegistry
  placedTents: FoundedSettlementTentsDeps
}

/** Deliberate zero-supply starting snapshot (plan settlements-003 §"Households")
 *  — a founding household must not silently mint the usual jittered starting
 *  food/wood/water a brand-new procedural household gets; expedition
 *  provisioning (settlements-npcs-027/028) is the only intended source. */
const FOUNDED_HOUSEHOLD_ZERO_SNAPSHOT: HouseholdSnapshot = {
  water: 0,
  items: { counts: {}, instances: [] },
  agriculture: { starterSeedsGranted: true },
}

type ResolvedFounder = {
  npcId: NpcId
  state: NpcAuthoritativeState
  /** `undefined` when this founder's stable tent already exists (repeat call
   *  path never re-resolves/re-consumes an instance). */
  tentInstanceId: string | undefined
  tentCondition: number
}

/**
 * Reusable, idempotent expedition-arrival -> settlement transaction (plan
 * settlements-003). Validates every fallible precondition — assignment
 * member travel arrival, site readiness, tent-instance availability, stable-
 * id conflicts — before any irreversible mutation (tent-instance removal,
 * residency change, household/economy creation). A settlement that already
 * exists for `siteId` short-circuits to `existing` without re-validating
 * arrival or consuming anything again.
 *
 * @domain settlements
 * @system founded-settlement
 * @role Turns an arrived expedition into ordinary founded-settlement/household/economy state.
 */
export function bootstrapFoundedSettlement(
  input: BootstrapFoundedSettlementInput,
  deps: BootstrapFoundedSettlementDeps,
): BootstrapFoundedSettlementResult {
  const settlementId = foundedSettlementId(input.siteId)
  const existing = deps.founded.get(settlementId)
  if (existing) {
    // Idempotent repair only — every founder's household/tent binding is
    // re-derived from the same stable ids, never re-consumed.
    for (const npcId of existing.residentNpcIds) {
      deps.founded.setResidency(npcId, settlementId)
      const tentId = foundedTentId(settlementId, npcId)
      if (!deps.placedTents.get(tentId)) {
        deps.placedTents.place(existing.x, existing.z, 0, input.nowDays, { id: tentId, condition: 100 })
      }
      deps.households.getOrCreate(
        foundedHouseholdId(settlementId, npcId),
        settlementId,
        tentId,
        undefined,
        FOUNDED_HOUSEHOLD_ZERO_SNAPSHOT,
      )
    }
    deps.economies.getOrCreate({
      id: settlementId,
      size: 'OUTPOST',
      foodSourceType: 'foraging',
      familyCount: existing.residentNpcIds.length,
      dominantResource: null,
    })
    return { status: 'existing', settlementId }
  }

  if (!input.siteReady) return { status: 'not_ready', reason: 'site-not-ready' }

  // `memberNpcIds` is a fixed 3-tuple (`EXPEDITION_PARTY_SIZE`) — always
  // non-empty by the assignment's own type contract.
  const memberNpcIds = input.assignment.memberNpcIds

  // Preflight — resolve every fallible precondition without mutating anything.
  const resolved: ResolvedFounder[] = []
  for (const npcId of memberNpcIds) {
    const state = deps.getNpcState(npcId)
    if (!state) return { status: 'not_ready', reason: 'missing-npc-state' }
    if (state.health.dead) return { status: 'not_ready', reason: 'member-dead' }
    const travel = state.travel
    if (!travel || travel.purpose?.kind !== 'expedition' || travel.purpose.assignmentId !== input.assignment.id) {
      return { status: 'not_ready', reason: 'not-travelling-for-this-assignment' }
    }
    if (travel.blocked) return { status: 'not_ready', reason: 'travel-blocked' }
    if (travel.arrival !== 'reached') return { status: 'not_ready', reason: 'not-arrived' }

    const tentId = foundedTentId(settlementId, npcId)
    if (deps.placedTents.get(tentId)) {
      resolved.push({ npcId, state, tentInstanceId: undefined, tentCondition: 100 })
      continue
    }
    const tentInstance = state.personalInventory.getInstances('tent').find(isTentItemInstance)
    if (!tentInstance) return { status: 'not_ready', reason: 'missing-tent-instance' }
    resolved.push({ npcId, state, tentInstanceId: tentInstance.id, tentCondition: tentInstance.condition })
  }

  // Commit — every precondition above held for every founder.
  const record: FoundedSettlementRecord = {
    id: settlementId,
    siteId: input.siteId,
    x: input.x,
    z: input.z,
    sponsorSettlementId: input.sponsorSettlementId,
    residentNpcIds: [...memberNpcIds],
    foundedAtDays: input.nowDays,
  }
  deps.founded.create(record)
  deps.economies.getOrCreate({
    id: settlementId,
    size: 'OUTPOST',
    foodSourceType: 'foraging',
    familyCount: memberNpcIds.length,
    dominantResource: null,
  })

  for (const founder of resolved) {
    deps.founded.setResidency(founder.npcId, settlementId)
    const tentId = foundedTentId(settlementId, founder.npcId)
    if (founder.tentInstanceId) {
      founder.state.personalInventory.removeInstance(founder.tentInstanceId)
      deps.placedTents.place(input.x, input.z, 0, input.nowDays, { id: tentId, condition: founder.tentCondition })
    }
    deps.households.getOrCreate(
      foundedHouseholdId(settlementId, founder.npcId),
      settlementId,
      tentId,
      undefined,
      FOUNDED_HOUSEHOLD_ZERO_SNAPSHOT,
    )
    observeNpcTravelArrival(founder.state)
  }

  return { status: 'created', settlementId }
}
