import type { PerfContext } from './types'
import { getMonitor } from './active'
import { PERF_CATEGORY_INDEX } from './types'

/** Cumulative agent-CPU diagnostics for one perf/benchmark session. Cheap
 *  counters and a few `performance.now()` spans — only recorded while
 *  `getMonitor().isEnabled()` (benchmark, `?perf=1`, or GUI toggle).
 *
 *  NPC wall-clock (`PERF_CATEGORY_INDEX.NPC`) is `SettlementsManager.update()`.
 *  Existing crowd/agent spans sit inside each `Settlement.update()`; the
 *  remaining NPC sections are the real sibling blocks that used to collapse
 *  into a single `other` remainder:
 *    livestock    `tickSettlementLivestock` (loaded + detached)
 *    rats         `rats.update`
 *    social       `advanceSocialPairing`
 *    streaming    `SettlementsManager.recheck` (stream-in/out, def resolve)
 *    maintenance  woodshed / storage visuals / torches / doors / signposts
 *    unattributed remainder of NPC total after those spans
 *
 *  Fauna's `AnimalAgent.update()` breakdown (fauna-cpu-diagnostics) uses a
 *  handful of *cumulative* spans rather than per-function profiling — each
 *  `addFauna*Ms` call adds one timed region's elapsed time onto a running
 *  total, so one logical section (e.g. "targeting") can be measured across
 *  two or more non-adjacent call sites inside `update()` without extra
 *  begin/end state.
 *
 *  `addFauna*Ms` and fauna adaptive counters route to **one** owner:
 *    livestock channel (`enterLivestockAgentUpdates`) → livestock sections
 *    fauna agent-update span (`beginFaunaAgentUpdates`) → FAUNA sections
 *    otherwise (settlement rats, unscoped callers) → neither
 *  The same delta is never added to both reports. Behaviour and
 *  life/presentation are sequential spans inside `AnimalAgent.update()`. */
export type AgentCpuDiagTotals = {
  npcCrowdMs: number
  npcAgentUpdatesMs: number
  /** `tickSettlementLivestock` — loaded settlements and detached livestock. */
  npcLivestockMs: number
  /** Nested: loaded-settlement `tickSettlementLivestock` only. */
  npcLivestockLoadedMs: number
  /** Nested: detached tick + `includes`/`upsert` bookkeeping. */
  npcLivestockDetachedMs: number
  /** `animal.update` loop inside `tickSettlementLivestock`. */
  livestockAnimalUpdatesMs: number
  /** Egg drop + `readyToRemove` scan/splice after the update loop. */
  livestockPostUpdateMs: number
  /** Detached `includes`/`upsert` after `tickSettlementLivestock`. */
  livestockDetachedBookkeepingMs: number
  livestockSensingMs: number
  livestockTargetingMs: number
  livestockDecisionMs: number
  livestockBehaviourMs: number
  livestockLifePresentationMs: number
  livestockUpdateCalls: number
  livestockUniqueAnimals: number
  livestockDuplicateUpdates: number
  livestockDetachedAnimals: number
  livestockDogUpdates: number
  livestockDogGuardScans: number
  livestockGuardPredatorCandidates: number
  livestockPestScans: number
  livestockPestRatCandidates: number
  livestockNearestCalls: number
  livestockNearestCandidatesChecked: number
  /** Movement hot-path (plan fauna-033) — `AnimalAgent.isWalkable()`'s
   *  `sampleLocalWater()` / `collidersNear()` calls, measured separately
   *  from the rest of `livestockBehaviourMs` since they were the primary
   *  suspects for the movement hot-path cost. `WorstMs` is the single
   *  slowest call this session, not an average. */
  livestockWaterSampleCalls: number
  livestockWaterSampleMs: number
  livestockWaterSampleWorstMs: number
  livestockColliderQueryCalls: number
  livestockColliderQueryMs: number
  livestockColliderQueryWorstMs: number
  livestockColliderQueryReturned: number
  /** Cadence counters (plan fauna-028) — `AnimalAgent` classified as
   *  `immediate` vs. reduced-cadence, and how often each cadence-gated
   *  section actually executed. */
  livestockFullRateAgents: number
  livestockReducedCadenceAgents: number
  livestockBehaviourExecutions: number
  livestockPresentationExecutions: number
  /** `Settlement.rats.update` — settlement-owned `AnimalAgent` ticks. */
  npcRatsMs: number
  /** `advanceSocialPairing` — campfire conversation pairing. */
  npcSocialMs: number
  /** `SettlementsManager.recheck` — stream-in/out, def resolve, off-screen travel. */
  npcStreamingMs: number
  /** Settlement `update()` tail: woodshed, storage visuals, torches, doors, signposts. */
  npcMaintenanceMs: number
  faunaAgentUpdatesMs: number
  /** `createFauna.ts`'s per-agent `sampleForestFactor()` call, measured
   *  separately from `AnimalAgent.update()` itself — shows how much of
   *  `faunaAgentUpdatesMs` is caller-side sampling vs. the agent's own logic. */
  faunaForestSamplingMs: number
  /** `AnimalAgent.update()` — `senseEnvironment()` (player perception, fire
   *  proximity) plus the scare-stimulus environment check. */
  faunaSensingMs: number
  /** `AnimalAgent.update()` — predator/dog target resolution
   *  (`resolveNpcTarget`, `resolveGuardTarget`) ahead of the decision branch. */
  faunaTargetingMs: number
  /** `AnimalAgent.update()` — throttled intent refresh + `decideFaunaBehaviour()`. */
  faunaDecisionMs: number
  /** `AnimalAgent.update()` — executing the chosen branch (`updateRabid` or
   *  the `decideFaunaBehaviour` switch). Movement/steering happens deep
   *  inside these branches and isn't cleanly separable without a larger
   *  refactor, so it stays counted here (see implementation notes). */
  faunaBehaviourMs: number
  /** `AnimalAgent.update()` — `tickPresentationAndLife()` (needs, water/
   *  drowning, corpse/lifecycle, animation, presentation bookkeeping). */
  faunaLifePresentationMs: number
  nearestCalls: number
  nearestCandidatesChecked: number
  herdLeaderCalls: number
  herdLeaderCandidatesChecked: number
  /** Runtime spatial-hash rebuild + occupancy queries (plan fauna-042). */
  faunaProximityRebuildMs: number
  faunaSpawnerBookkeepingMs: number
  faunaProximityQueries: number
  faunaProximityCandidatesVisited: number
  /** Movement hot-path (plan fauna-033) — see the `livestock*` pair above. */
  faunaWaterSampleCalls: number
  faunaWaterSampleMs: number
  faunaWaterSampleWorstMs: number
  faunaColliderQueryCalls: number
  faunaColliderQueryMs: number
  faunaColliderQueryWorstMs: number
  faunaColliderQueryReturned: number
  /** Adaptive-simulation candidates (fauna-cpu-diagnostics) — cheap
   *  per-frame counters, not a new telemetry system. */
  faunaUpdateCalls: number
  faunaSensingPasses: number
  faunaDecisionPasses: number
  faunaHighPriorityAgents: number
  /** Counted when an expensive branch's behaviour section **actually ran**
   *  (plan fauna-028). Before cadence existed, classification and execution
   *  were the same tick, so this stays directly comparable to older runs. */
  faunaExpensiveBehaviourAgents: number
  /** Cadence counters (plan fauna-028) — see the livestock pair above. */
  faunaFullRateAgents: number
  faunaReducedCadenceAgents: number
  faunaBehaviourExecutions: number
  faunaPresentationExecutions: number
  /** Sensing/cache candidates. */
  forestSampleCalls: number
  fireScanCandidates: number
  villageScanCandidates: number
  playerPerceptionChecks: number
}

export type AgentCpuReport = {
  frames: number
  population: {
    npcLoaded: number
    faunaActive: number
  }
  npc: {
    totalMsPerFrame: number
    crowdPassMsPerFrame: number
    agentUpdatesMsPerFrame: number
    livestockMsPerFrame: number
    ratsMsPerFrame: number
    socialMsPerFrame: number
    streamingMsPerFrame: number
    maintenanceMsPerFrame: number
    unattributedMsPerFrame: number
    crowdPassCumulativeMs: number
    agentUpdatesCumulativeMs: number
    livestockCumulativeMs: number
    livestockLoadedMsPerFrame: number
    livestockDetachedMsPerFrame: number
    livestockUnattributedMsPerFrame: number
    livestockAnimalUpdatesMsPerFrame: number
    livestockPostUpdateMsPerFrame: number
    livestockDetachedBookkeepingMsPerFrame: number
    livestockSensingMsPerFrame: number
    livestockTargetingMsPerFrame: number
    livestockDecisionMsPerFrame: number
    livestockBehaviourMsPerFrame: number
    livestockLifePresentationMsPerFrame: number
    livestockOtherUpdateMsPerFrame: number
    livestockUpdateCallsPerFrame: number
    livestockUniqueAnimalsPerFrame: number
    livestockDuplicateUpdatesPerFrame: number
    livestockDetachedAnimalsPerFrame: number
    livestockDogUpdatesPerFrame: number
    livestockDogGuardScansPerFrame: number
    livestockGuardPredatorCandidatesPerFrame: number
    livestockPestScansPerFrame: number
    livestockPestRatCandidatesPerFrame: number
    livestockNearestScansPerFrame: number
    livestockNearestCandidatesPerFrame: number
    livestockWaterSampleCallsPerFrame: number
    livestockWaterSampleMsPerFrame: number
    livestockWaterSampleWorstMs: number
    livestockColliderQueryCallsPerFrame: number
    livestockColliderQueryMsPerFrame: number
    livestockColliderQueryWorstMs: number
    livestockColliderQueryReturnedPerFrame: number
    livestockFullRateAgentsPerFrame: number
    livestockReducedCadenceAgentsPerFrame: number
    livestockBehaviourExecutionsPerFrame: number
    livestockPresentationExecutionsPerFrame: number
    ratsCumulativeMs: number
    socialCumulativeMs: number
    streamingCumulativeMs: number
    maintenanceCumulativeMs: number
  }
  fauna: {
    totalMsPerFrame: number
    agentUpdatesMsPerFrame: number
    otherMsPerFrame: number
    agentUpdatesCumulativeMs: number
    forestSamplingMsPerFrame: number
    forestSamplingCumulativeMs: number
    sensingMsPerFrame: number
    sensingCumulativeMs: number
    targetingMsPerFrame: number
    targetingCumulativeMs: number
    decisionMsPerFrame: number
    decisionCumulativeMs: number
    behaviourMsPerFrame: number
    behaviourCumulativeMs: number
    lifePresentationMsPerFrame: number
    lifePresentationCumulativeMs: number
    otherUpdateMsPerFrame: number
    updateCallsPerFrame: number
    sensingPassesPerFrame: number
    decisionPassesPerFrame: number
    highPriorityAgentsPerFrame: number
    expensiveBehaviourAgentsPerFrame: number
    fullRateAgentsPerFrame: number
    reducedCadenceAgentsPerFrame: number
    behaviourExecutionsPerFrame: number
    presentationExecutionsPerFrame: number
    forestSamplesPerFrame: number
    fireScanCandidatesPerFrame: number
    villageScanCandidatesPerFrame: number
    playerPerceptionChecksPerFrame: number
    nearestScansPerFrame: number
    nearestCandidatesPerFrame: number
    herdLeaderScansPerFrame: number
    herdLeaderCandidatesPerFrame: number
    nearestCalls: number
    nearestCandidatesChecked: number
    herdLeaderCalls: number
    herdLeaderCandidatesChecked: number
    proximityRebuildMsPerFrame: number
    spawnerBookkeepingMsPerFrame: number
    proximityQueriesPerFrame: number
    proximityCandidatesPerFrame: number
    waterSampleCallsPerFrame: number
    waterSampleMsPerFrame: number
    waterSampleWorstMs: number
    colliderQueryCallsPerFrame: number
    colliderQueryMsPerFrame: number
    colliderQueryWorstMs: number
    colliderQueryReturnedPerFrame: number
  }
}

export type AgentCpuDiag = {
  isEnabled: () => boolean
  beginNpcCrowd: () => void
  endNpcCrowd: () => void
  beginNpcAgentUpdates: () => void
  endNpcAgentUpdates: () => void
  beginNpcLivestock: () => void
  endNpcLivestock: () => void
  beginNpcLivestockLoaded: () => void
  endNpcLivestockLoaded: () => void
  beginNpcLivestockDetached: () => void
  endNpcLivestockDetached: () => void
  beginLivestockAnimalUpdates: () => void
  endLivestockAnimalUpdates: () => void
  beginLivestockPostUpdate: () => void
  endLivestockPostUpdate: () => void
  beginLivestockDetachedBookkeeping: () => void
  endLivestockDetachedBookkeeping: () => void
  beginLivestockFrame: () => void
  endLivestockFrame: () => void
  enterLivestockAgentUpdates: () => void
  leaveLivestockAgentUpdates: () => void
  recordLivestockAgentUpdate: (animalId: string, isDog: boolean) => void
  recordLivestockDetachedCount: (count: number) => void
  recordLivestockGuardScan: (predatorCandidates: number) => void
  recordLivestockPestScan: (ratCandidates: number) => void
  beginNpcRats: () => void
  endNpcRats: () => void
  beginNpcSocial: () => void
  endNpcSocial: () => void
  beginNpcStreaming: () => void
  endNpcStreaming: () => void
  beginNpcMaintenance: () => void
  endNpcMaintenance: () => void
  beginFaunaAgentUpdates: () => void
  endFaunaAgentUpdates: () => void
  addFaunaForestSamplingMs: (ms: number) => void
  addFaunaSensingMs: (ms: number) => void
  addFaunaTargetingMs: (ms: number) => void
  addFaunaDecisionMs: (ms: number) => void
  addFaunaBehaviourMs: (ms: number) => void
  addFaunaLifePresentationMs: (ms: number) => void
  recordFaunaUpdateCall: () => void
  recordFaunaSensingPass: () => void
  recordFaunaDecisionPass: () => void
  recordFaunaHighPriorityAgent: () => void
  recordFaunaExpensiveBehaviourAgent: () => void
  /** Cadence counters (plan fauna-028) — routed to whichever channel owns
   *  the current `AnimalAgent.update()` call (livestock vs. wild fauna), the
   *  same owner rule `addSectionMs` uses, so one tick is never counted twice. */
  recordAnimalCadence: (fullRate: boolean) => void
  recordAnimalBehaviourExecution: () => void
  recordAnimalPresentationExecution: () => void
  recordForestSample: () => void
  recordFireScan: (candidatesChecked: number) => void
  recordVillageScan: (candidatesChecked: number) => void
  recordPlayerPerceptionCheck: () => void
  recordNearestScan: (candidatesChecked: number) => void
  recordHerdLeaderScan: (candidatesChecked: number) => void
  recordFaunaProximityQuery: (candidatesVisited: number) => void
  addFaunaProximityRebuildMs: (ms: number) => void
  addFaunaSpawnerBookkeepingMs: (ms: number) => void
  /** Movement hot-path (plan fauna-033) — routed to whichever channel owns
   *  the current `AnimalAgent.update()` call, same owner rule as
   *  `addFauna*Ms`. `ms` is one `sampleLocalWater()` call's own duration. */
  addFaunaWaterSampleMs: (ms: number) => void
  /** Movement hot-path (plan fauna-033) — one `collidersNear()`
   *  (`ColliderRegistry.query()`) call's duration plus how many colliders it
   *  returned (before the caller's own `colliderActiveAtY`/containment
   *  filtering). */
  addFaunaColliderQueryMs: (ms: number, returned: number) => void
  snapshot: () => AgentCpuDiagTotals
  reset: () => void
}

export function emptyAgentCpuDiagTotals(): AgentCpuDiagTotals {
  return emptyTotals()
}

function emptyTotals(): AgentCpuDiagTotals {
  return {
    npcCrowdMs: 0,
    npcAgentUpdatesMs: 0,
    npcLivestockMs: 0,
    npcLivestockLoadedMs: 0,
    npcLivestockDetachedMs: 0,
    livestockAnimalUpdatesMs: 0,
    livestockPostUpdateMs: 0,
    livestockDetachedBookkeepingMs: 0,
    livestockSensingMs: 0,
    livestockTargetingMs: 0,
    livestockDecisionMs: 0,
    livestockBehaviourMs: 0,
    livestockLifePresentationMs: 0,
    livestockUpdateCalls: 0,
    livestockUniqueAnimals: 0,
    livestockDuplicateUpdates: 0,
    livestockDetachedAnimals: 0,
    livestockDogUpdates: 0,
    livestockDogGuardScans: 0,
    livestockGuardPredatorCandidates: 0,
    livestockPestScans: 0,
    livestockPestRatCandidates: 0,
    livestockNearestCalls: 0,
    livestockNearestCandidatesChecked: 0,
    livestockWaterSampleCalls: 0,
    livestockWaterSampleMs: 0,
    livestockWaterSampleWorstMs: 0,
    livestockColliderQueryCalls: 0,
    livestockColliderQueryMs: 0,
    livestockColliderQueryWorstMs: 0,
    livestockColliderQueryReturned: 0,
    livestockFullRateAgents: 0,
    livestockReducedCadenceAgents: 0,
    livestockBehaviourExecutions: 0,
    livestockPresentationExecutions: 0,
    npcRatsMs: 0,
    npcSocialMs: 0,
    npcStreamingMs: 0,
    npcMaintenanceMs: 0,
    faunaAgentUpdatesMs: 0,
    faunaForestSamplingMs: 0,
    faunaSensingMs: 0,
    faunaTargetingMs: 0,
    faunaDecisionMs: 0,
    faunaBehaviourMs: 0,
    faunaLifePresentationMs: 0,
    nearestCalls: 0,
    nearestCandidatesChecked: 0,
    herdLeaderCalls: 0,
    herdLeaderCandidatesChecked: 0,
    faunaProximityRebuildMs: 0,
    faunaSpawnerBookkeepingMs: 0,
    faunaProximityQueries: 0,
    faunaProximityCandidatesVisited: 0,
    faunaWaterSampleCalls: 0,
    faunaWaterSampleMs: 0,
    faunaWaterSampleWorstMs: 0,
    faunaColliderQueryCalls: 0,
    faunaColliderQueryMs: 0,
    faunaColliderQueryWorstMs: 0,
    faunaColliderQueryReturned: 0,
    faunaUpdateCalls: 0,
    faunaSensingPasses: 0,
    faunaDecisionPasses: 0,
    faunaHighPriorityAgents: 0,
    faunaExpensiveBehaviourAgents: 0,
    faunaFullRateAgents: 0,
    faunaReducedCadenceAgents: 0,
    faunaBehaviourExecutions: 0,
    faunaPresentationExecutions: 0,
    forestSampleCalls: 0,
    fireScanCandidates: 0,
    villageScanCandidates: 0,
    playerPerceptionChecks: 0,
  }
}

export function createAgentCpuDiag(): AgentCpuDiag {
  const totals = emptyTotals()
  let npcCrowdStart = Number.NaN
  let npcAgentStart = Number.NaN
  let npcLivestockStart = Number.NaN
  let npcLivestockLoadedStart = Number.NaN
  let npcLivestockDetachedStart = Number.NaN
  let livestockAnimalUpdatesStart = Number.NaN
  let livestockPostUpdateStart = Number.NaN
  let livestockDetachedBookkeepingStart = Number.NaN
  let livestockAgentDepth = 0
  const livestockFrameIds = new Set<string>()
  let npcRatsStart = Number.NaN
  let npcSocialStart = Number.NaN
  let npcStreamingStart = Number.NaN
  let npcMaintenanceStart = Number.NaN
  let faunaAgentStart = Number.NaN
  let faunaAgentDepth = 0

  function addCadenceCount(
    faunaKey: 'faunaFullRateAgents' | 'faunaReducedCadenceAgents' | 'faunaBehaviourExecutions' | 'faunaPresentationExecutions',
    livestockKey: 'livestockFullRateAgents' | 'livestockReducedCadenceAgents' | 'livestockBehaviourExecutions' | 'livestockPresentationExecutions',
  ): void {
    if (livestockAgentDepth > 0) totals[livestockKey]++
    else if (faunaAgentDepth > 0) totals[faunaKey]++
  }

  function addSectionMs(faunaKey: 'faunaSensingMs' | 'faunaTargetingMs' | 'faunaDecisionMs' | 'faunaBehaviourMs' | 'faunaLifePresentationMs', livestockKey: 'livestockSensingMs' | 'livestockTargetingMs' | 'livestockDecisionMs' | 'livestockBehaviourMs' | 'livestockLifePresentationMs', ms: number): void {
    if (livestockAgentDepth > 0) totals[livestockKey] += ms
    else if (faunaAgentDepth > 0) totals[faunaKey] += ms
  }

  return {
    isEnabled: () => getMonitor().isEnabled(),
    beginNpcCrowd() {
      if (!this.isEnabled()) return
      npcCrowdStart = performance.now()
    },
    endNpcCrowd() {
      if (!this.isEnabled() || !Number.isFinite(npcCrowdStart)) return
      totals.npcCrowdMs += performance.now() - npcCrowdStart
      npcCrowdStart = Number.NaN
    },
    beginNpcAgentUpdates() {
      if (!this.isEnabled()) return
      npcAgentStart = performance.now()
    },
    endNpcAgentUpdates() {
      if (!this.isEnabled() || !Number.isFinite(npcAgentStart)) return
      totals.npcAgentUpdatesMs += performance.now() - npcAgentStart
      npcAgentStart = Number.NaN
    },
    beginNpcLivestock() {
      if (!this.isEnabled()) return
      npcLivestockStart = performance.now()
    },
    endNpcLivestock() {
      if (!this.isEnabled() || !Number.isFinite(npcLivestockStart)) return
      totals.npcLivestockMs += performance.now() - npcLivestockStart
      npcLivestockStart = Number.NaN
    },
    beginNpcLivestockLoaded() {
      if (!this.isEnabled()) return
      npcLivestockLoadedStart = performance.now()
    },
    endNpcLivestockLoaded() {
      if (!this.isEnabled() || !Number.isFinite(npcLivestockLoadedStart)) return
      totals.npcLivestockLoadedMs += performance.now() - npcLivestockLoadedStart
      npcLivestockLoadedStart = Number.NaN
    },
    beginNpcLivestockDetached() {
      if (!this.isEnabled()) return
      npcLivestockDetachedStart = performance.now()
    },
    endNpcLivestockDetached() {
      if (!this.isEnabled() || !Number.isFinite(npcLivestockDetachedStart)) return
      totals.npcLivestockDetachedMs += performance.now() - npcLivestockDetachedStart
      npcLivestockDetachedStart = Number.NaN
    },
    beginLivestockAnimalUpdates() {
      if (!this.isEnabled()) return
      livestockAnimalUpdatesStart = performance.now()
    },
    endLivestockAnimalUpdates() {
      if (!this.isEnabled() || !Number.isFinite(livestockAnimalUpdatesStart)) return
      totals.livestockAnimalUpdatesMs += performance.now() - livestockAnimalUpdatesStart
      livestockAnimalUpdatesStart = Number.NaN
    },
    beginLivestockPostUpdate() {
      if (!this.isEnabled()) return
      livestockPostUpdateStart = performance.now()
    },
    endLivestockPostUpdate() {
      if (!this.isEnabled() || !Number.isFinite(livestockPostUpdateStart)) return
      totals.livestockPostUpdateMs += performance.now() - livestockPostUpdateStart
      livestockPostUpdateStart = Number.NaN
    },
    beginLivestockDetachedBookkeeping() {
      if (!this.isEnabled()) return
      livestockDetachedBookkeepingStart = performance.now()
    },
    endLivestockDetachedBookkeeping() {
      if (!this.isEnabled() || !Number.isFinite(livestockDetachedBookkeepingStart)) return
      totals.livestockDetachedBookkeepingMs += performance.now() - livestockDetachedBookkeepingStart
      livestockDetachedBookkeepingStart = Number.NaN
    },
    beginLivestockFrame() {
      if (!this.isEnabled()) return
      livestockFrameIds.clear()
    },
    endLivestockFrame() {
      if (!this.isEnabled()) return
      totals.livestockUniqueAnimals += livestockFrameIds.size
      livestockFrameIds.clear()
    },
    enterLivestockAgentUpdates() {
      if (!this.isEnabled()) return
      livestockAgentDepth++
    },
    leaveLivestockAgentUpdates() {
      if (!this.isEnabled() || livestockAgentDepth <= 0) return
      livestockAgentDepth--
    },
    recordLivestockAgentUpdate(animalId, isDog) {
      if (!this.isEnabled()) return
      totals.livestockUpdateCalls++
      if (livestockFrameIds.has(animalId)) totals.livestockDuplicateUpdates++
      else livestockFrameIds.add(animalId)
      if (isDog) totals.livestockDogUpdates++
    },
    recordLivestockDetachedCount(count) {
      if (!this.isEnabled()) return
      totals.livestockDetachedAnimals += count
    },
    recordLivestockGuardScan(predatorCandidates) {
      if (!this.isEnabled() || livestockAgentDepth <= 0) return
      totals.livestockDogGuardScans++
      totals.livestockGuardPredatorCandidates += predatorCandidates
    },
    recordLivestockPestScan(ratCandidates) {
      if (!this.isEnabled() || livestockAgentDepth <= 0) return
      totals.livestockPestScans++
      totals.livestockPestRatCandidates += ratCandidates
    },
    beginNpcRats() {
      if (!this.isEnabled()) return
      npcRatsStart = performance.now()
    },
    endNpcRats() {
      if (!this.isEnabled() || !Number.isFinite(npcRatsStart)) return
      totals.npcRatsMs += performance.now() - npcRatsStart
      npcRatsStart = Number.NaN
    },
    beginNpcSocial() {
      if (!this.isEnabled()) return
      npcSocialStart = performance.now()
    },
    endNpcSocial() {
      if (!this.isEnabled() || !Number.isFinite(npcSocialStart)) return
      totals.npcSocialMs += performance.now() - npcSocialStart
      npcSocialStart = Number.NaN
    },
    beginNpcStreaming() {
      if (!this.isEnabled()) return
      npcStreamingStart = performance.now()
    },
    endNpcStreaming() {
      if (!this.isEnabled() || !Number.isFinite(npcStreamingStart)) return
      totals.npcStreamingMs += performance.now() - npcStreamingStart
      npcStreamingStart = Number.NaN
    },
    beginNpcMaintenance() {
      if (!this.isEnabled()) return
      npcMaintenanceStart = performance.now()
    },
    endNpcMaintenance() {
      if (!this.isEnabled() || !Number.isFinite(npcMaintenanceStart)) return
      totals.npcMaintenanceMs += performance.now() - npcMaintenanceStart
      npcMaintenanceStart = Number.NaN
    },
    beginFaunaAgentUpdates() {
      if (!this.isEnabled()) return
      faunaAgentStart = performance.now()
      faunaAgentDepth++
    },
    endFaunaAgentUpdates() {
      if (!this.isEnabled()) return
      if (Number.isFinite(faunaAgentStart)) {
        totals.faunaAgentUpdatesMs += performance.now() - faunaAgentStart
        faunaAgentStart = Number.NaN
      }
      if (faunaAgentDepth > 0) faunaAgentDepth--
    },
    addFaunaForestSamplingMs(ms) {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaForestSamplingMs += ms
    },
    addFaunaSensingMs(ms) {
      if (!this.isEnabled()) return
      addSectionMs('faunaSensingMs', 'livestockSensingMs', ms)
    },
    addFaunaTargetingMs(ms) {
      if (!this.isEnabled()) return
      addSectionMs('faunaTargetingMs', 'livestockTargetingMs', ms)
    },
    addFaunaDecisionMs(ms) {
      if (!this.isEnabled()) return
      addSectionMs('faunaDecisionMs', 'livestockDecisionMs', ms)
    },
    addFaunaBehaviourMs(ms) {
      if (!this.isEnabled()) return
      addSectionMs('faunaBehaviourMs', 'livestockBehaviourMs', ms)
    },
    addFaunaLifePresentationMs(ms) {
      if (!this.isEnabled()) return
      addSectionMs('faunaLifePresentationMs', 'livestockLifePresentationMs', ms)
    },
    recordFaunaUpdateCall() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaUpdateCalls++
    },
    recordFaunaSensingPass() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaSensingPasses++
    },
    recordFaunaDecisionPass() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaDecisionPasses++
    },
    recordFaunaHighPriorityAgent() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaHighPriorityAgents++
    },
    recordFaunaExpensiveBehaviourAgent() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.faunaExpensiveBehaviourAgents++
    },
    recordAnimalCadence(fullRate) {
      if (!this.isEnabled()) return
      if (fullRate) addCadenceCount('faunaFullRateAgents', 'livestockFullRateAgents')
      else addCadenceCount('faunaReducedCadenceAgents', 'livestockReducedCadenceAgents')
    },
    recordAnimalBehaviourExecution() {
      if (!this.isEnabled()) return
      addCadenceCount('faunaBehaviourExecutions', 'livestockBehaviourExecutions')
    },
    recordAnimalPresentationExecution() {
      if (!this.isEnabled()) return
      addCadenceCount('faunaPresentationExecutions', 'livestockPresentationExecutions')
    },
    recordForestSample() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.forestSampleCalls++
    },
    recordFireScan(candidatesChecked) {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.fireScanCandidates += candidatesChecked
    },
    recordVillageScan(candidatesChecked) {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.villageScanCandidates += candidatesChecked
    },
    recordPlayerPerceptionCheck() {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.playerPerceptionChecks++
    },
    recordNearestScan(candidatesChecked) {
      if (!this.isEnabled()) return
      if (livestockAgentDepth > 0) {
        totals.livestockNearestCalls++
        totals.livestockNearestCandidatesChecked += candidatesChecked
        return
      }
      if (faunaAgentDepth <= 0) return
      totals.nearestCalls++
      totals.nearestCandidatesChecked += candidatesChecked
    },
    recordHerdLeaderScan(candidatesChecked) {
      if (!this.isEnabled() || livestockAgentDepth > 0 || faunaAgentDepth <= 0) return
      totals.herdLeaderCalls++
      totals.herdLeaderCandidatesChecked += candidatesChecked
    },
    recordFaunaProximityQuery(candidatesVisited) {
      if (!this.isEnabled()) return
      totals.faunaProximityQueries++
      totals.faunaProximityCandidatesVisited += candidatesVisited
    },
    addFaunaProximityRebuildMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaProximityRebuildMs += ms
    },
    addFaunaSpawnerBookkeepingMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaSpawnerBookkeepingMs += ms
    },
    addFaunaWaterSampleMs(ms) {
      if (!this.isEnabled()) return
      if (livestockAgentDepth > 0) {
        totals.livestockWaterSampleCalls++
        totals.livestockWaterSampleMs += ms
        if (ms > totals.livestockWaterSampleWorstMs) totals.livestockWaterSampleWorstMs = ms
      } else if (faunaAgentDepth > 0) {
        totals.faunaWaterSampleCalls++
        totals.faunaWaterSampleMs += ms
        if (ms > totals.faunaWaterSampleWorstMs) totals.faunaWaterSampleWorstMs = ms
      }
    },
    addFaunaColliderQueryMs(ms, returned) {
      if (!this.isEnabled()) return
      if (livestockAgentDepth > 0) {
        totals.livestockColliderQueryCalls++
        totals.livestockColliderQueryMs += ms
        totals.livestockColliderQueryReturned += returned
        if (ms > totals.livestockColliderQueryWorstMs) totals.livestockColliderQueryWorstMs = ms
      } else if (faunaAgentDepth > 0) {
        totals.faunaColliderQueryCalls++
        totals.faunaColliderQueryMs += ms
        totals.faunaColliderQueryReturned += returned
        if (ms > totals.faunaColliderQueryWorstMs) totals.faunaColliderQueryWorstMs = ms
      }
    },
    snapshot: () => ({ ...totals }),
    reset() {
      Object.assign(totals, emptyTotals())
      npcCrowdStart = Number.NaN
      npcAgentStart = Number.NaN
      npcLivestockStart = Number.NaN
      npcLivestockLoadedStart = Number.NaN
      npcLivestockDetachedStart = Number.NaN
      livestockAnimalUpdatesStart = Number.NaN
      livestockPostUpdateStart = Number.NaN
      livestockDetachedBookkeepingStart = Number.NaN
      livestockAgentDepth = 0
      livestockFrameIds.clear()
      npcRatsStart = Number.NaN
      npcSocialStart = Number.NaN
      npcStreamingStart = Number.NaN
      npcMaintenanceStart = Number.NaN
      faunaAgentStart = Number.NaN
      faunaAgentDepth = 0
    },
  }
}

const NOOP: AgentCpuDiag = {
  isEnabled: () => false,
  beginNpcCrowd: () => {},
  endNpcCrowd: () => {},
  beginNpcAgentUpdates: () => {},
  endNpcAgentUpdates: () => {},
  beginNpcLivestock: () => {},
  endNpcLivestock: () => {},
  beginNpcLivestockLoaded: () => {},
  endNpcLivestockLoaded: () => {},
  beginNpcLivestockDetached: () => {},
  endNpcLivestockDetached: () => {},
  beginLivestockAnimalUpdates: () => {},
  endLivestockAnimalUpdates: () => {},
  beginLivestockPostUpdate: () => {},
  endLivestockPostUpdate: () => {},
  beginLivestockDetachedBookkeeping: () => {},
  endLivestockDetachedBookkeeping: () => {},
  beginLivestockFrame: () => {},
  endLivestockFrame: () => {},
  enterLivestockAgentUpdates: () => {},
  leaveLivestockAgentUpdates: () => {},
  recordLivestockAgentUpdate: () => {},
  recordLivestockDetachedCount: () => {},
  recordLivestockGuardScan: () => {},
  recordLivestockPestScan: () => {},
  beginNpcRats: () => {},
  endNpcRats: () => {},
  beginNpcSocial: () => {},
  endNpcSocial: () => {},
  beginNpcStreaming: () => {},
  endNpcStreaming: () => {},
  beginNpcMaintenance: () => {},
  endNpcMaintenance: () => {},
  beginFaunaAgentUpdates: () => {},
  endFaunaAgentUpdates: () => {},
  addFaunaForestSamplingMs: () => {},
  addFaunaSensingMs: () => {},
  addFaunaTargetingMs: () => {},
  addFaunaDecisionMs: () => {},
  addFaunaBehaviourMs: () => {},
  addFaunaLifePresentationMs: () => {},
  recordFaunaUpdateCall: () => {},
  recordFaunaSensingPass: () => {},
  recordFaunaDecisionPass: () => {},
  recordFaunaHighPriorityAgent: () => {},
  recordFaunaExpensiveBehaviourAgent: () => {},
  recordAnimalCadence: () => {},
  recordAnimalBehaviourExecution: () => {},
  recordAnimalPresentationExecution: () => {},
  recordForestSample: () => {},
  recordFireScan: () => {},
  recordVillageScan: () => {},
  recordPlayerPerceptionCheck: () => {},
  recordNearestScan: () => {},
  recordHerdLeaderScan: () => {},
  recordFaunaProximityQuery: () => {},
  addFaunaProximityRebuildMs: () => {},
  addFaunaSpawnerBookkeepingMs: () => {},
  addFaunaWaterSampleMs: () => {},
  addFaunaColliderQueryMs: () => {},
  snapshot: () => emptyTotals(),
  reset: () => {},
}

let active: AgentCpuDiag = createAgentCpuDiag()

export function setActiveAgentCpuDiag(diag: AgentCpuDiag | null): void {
  active = diag ?? NOOP
}

export function getAgentCpuDiag(): AgentCpuDiag {
  return active
}

export function buildAgentCpuReport(input: {
  frames: number
  totals: AgentCpuDiagTotals
  categoryMsSum: Float64Array
  context: PerfContext
}): AgentCpuReport | null {
  const frames = Math.max(1, input.frames)
  const npcTotalMs = input.categoryMsSum[PERF_CATEGORY_INDEX.NPC]! / frames
  const faunaTotalMs = input.categoryMsSum[PERF_CATEGORY_INDEX.FAUNA]! / frames
  const crowdMs = input.totals.npcCrowdMs / frames
  const npcAgentMs = input.totals.npcAgentUpdatesMs / frames
  const livestockMs = input.totals.npcLivestockMs / frames
  const livestockLoadedMs = input.totals.npcLivestockLoadedMs / frames
  const livestockDetachedMs = input.totals.npcLivestockDetachedMs / frames
  const livestockAnimalMs = input.totals.livestockAnimalUpdatesMs / frames
  const livestockSensingMs = input.totals.livestockSensingMs / frames
  const livestockTargetingMs = input.totals.livestockTargetingMs / frames
  const livestockDecisionMs = input.totals.livestockDecisionMs / frames
  const livestockBehaviourMs = input.totals.livestockBehaviourMs / frames
  const livestockLifeMs = input.totals.livestockLifePresentationMs / frames
  const ratsMs = input.totals.npcRatsMs / frames
  const socialMs = input.totals.npcSocialMs / frames
  const streamingMs = input.totals.npcStreamingMs / frames
  const maintenanceMs = input.totals.npcMaintenanceMs / frames
  const faunaAgentMs = input.totals.faunaAgentUpdatesMs / frames
  const npcAttributedMs = crowdMs + npcAgentMs + livestockMs + ratsMs + socialMs + streamingMs + maintenanceMs

  const hasNpc = npcTotalMs >= 0.01 || npcAttributedMs >= 0.01
    || input.totals.livestockUpdateCalls > 0
  const hasFauna = faunaTotalMs >= 0.01 || faunaAgentMs >= 0.01
    || input.totals.nearestCalls > 0 || input.totals.herdLeaderCalls > 0
    || input.totals.faunaUpdateCalls > 0
  if (!hasNpc && !hasFauna) return null

  return {
    frames,
    population: {
      npcLoaded: input.context.npcCount,
      faunaActive: input.context.faunaCount,
    },
    npc: {
      totalMsPerFrame: round1(npcTotalMs),
      crowdPassMsPerFrame: round1(crowdMs),
      agentUpdatesMsPerFrame: round1(npcAgentMs),
      livestockMsPerFrame: round1(livestockMs),
      livestockLoadedMsPerFrame: round1(livestockLoadedMs),
      livestockDetachedMsPerFrame: round1(livestockDetachedMs),
      livestockUnattributedMsPerFrame: round1(Math.max(0, livestockMs - livestockLoadedMs - livestockDetachedMs)),
      livestockAnimalUpdatesMsPerFrame: round1(livestockAnimalMs),
      livestockPostUpdateMsPerFrame: round1(input.totals.livestockPostUpdateMs / frames),
      livestockDetachedBookkeepingMsPerFrame: round1(input.totals.livestockDetachedBookkeepingMs / frames),
      livestockSensingMsPerFrame: round1(livestockSensingMs),
      livestockTargetingMsPerFrame: round1(livestockTargetingMs),
      livestockDecisionMsPerFrame: round1(livestockDecisionMs),
      livestockBehaviourMsPerFrame: round1(livestockBehaviourMs),
      livestockLifePresentationMsPerFrame: round1(livestockLifeMs),
      livestockOtherUpdateMsPerFrame: round1(Math.max(0,
        livestockAnimalMs
        - livestockSensingMs
        - livestockTargetingMs
        - livestockDecisionMs
        - livestockBehaviourMs
        - livestockLifeMs,
      )),
      livestockUpdateCallsPerFrame: round1(input.totals.livestockUpdateCalls / frames),
      livestockUniqueAnimalsPerFrame: round1(input.totals.livestockUniqueAnimals / frames),
      livestockDuplicateUpdatesPerFrame: round1(input.totals.livestockDuplicateUpdates / frames),
      livestockDetachedAnimalsPerFrame: round1(input.totals.livestockDetachedAnimals / frames),
      livestockDogUpdatesPerFrame: round1(input.totals.livestockDogUpdates / frames),
      livestockDogGuardScansPerFrame: round1(input.totals.livestockDogGuardScans / frames),
      livestockGuardPredatorCandidatesPerFrame: round1(input.totals.livestockGuardPredatorCandidates / frames),
      livestockPestScansPerFrame: round1(input.totals.livestockPestScans / frames),
      livestockPestRatCandidatesPerFrame: round1(input.totals.livestockPestRatCandidates / frames),
      livestockNearestScansPerFrame: round1(input.totals.livestockNearestCalls / frames),
      livestockNearestCandidatesPerFrame: round1(input.totals.livestockNearestCandidatesChecked / frames),
      livestockWaterSampleCallsPerFrame: round1(input.totals.livestockWaterSampleCalls / frames),
      livestockWaterSampleMsPerFrame: round1(input.totals.livestockWaterSampleMs / frames),
      livestockWaterSampleWorstMs: round1(input.totals.livestockWaterSampleWorstMs),
      livestockColliderQueryCallsPerFrame: round1(input.totals.livestockColliderQueryCalls / frames),
      livestockColliderQueryMsPerFrame: round1(input.totals.livestockColliderQueryMs / frames),
      livestockColliderQueryWorstMs: round1(input.totals.livestockColliderQueryWorstMs),
      livestockColliderQueryReturnedPerFrame: round1(input.totals.livestockColliderQueryReturned / frames),
      livestockFullRateAgentsPerFrame: round1(input.totals.livestockFullRateAgents / frames),
      livestockReducedCadenceAgentsPerFrame: round1(input.totals.livestockReducedCadenceAgents / frames),
      livestockBehaviourExecutionsPerFrame: round1(input.totals.livestockBehaviourExecutions / frames),
      livestockPresentationExecutionsPerFrame: round1(input.totals.livestockPresentationExecutions / frames),
      ratsMsPerFrame: round1(ratsMs),
      socialMsPerFrame: round1(socialMs),
      streamingMsPerFrame: round1(streamingMs),
      maintenanceMsPerFrame: round1(maintenanceMs),
      unattributedMsPerFrame: round1(Math.max(0, npcTotalMs - npcAttributedMs)),
      crowdPassCumulativeMs: round1(input.totals.npcCrowdMs),
      agentUpdatesCumulativeMs: round1(input.totals.npcAgentUpdatesMs),
      livestockCumulativeMs: round1(input.totals.npcLivestockMs),
      ratsCumulativeMs: round1(input.totals.npcRatsMs),
      socialCumulativeMs: round1(input.totals.npcSocialMs),
      streamingCumulativeMs: round1(input.totals.npcStreamingMs),
      maintenanceCumulativeMs: round1(input.totals.npcMaintenanceMs),
    },
    fauna: {
      totalMsPerFrame: round1(faunaTotalMs),
      agentUpdatesMsPerFrame: round1(faunaAgentMs),
      otherMsPerFrame: round1(Math.max(0, faunaTotalMs - faunaAgentMs)),
      agentUpdatesCumulativeMs: round1(input.totals.faunaAgentUpdatesMs),
      forestSamplingMsPerFrame: round1(input.totals.faunaForestSamplingMs / frames),
      forestSamplingCumulativeMs: round1(input.totals.faunaForestSamplingMs),
      sensingMsPerFrame: round1(input.totals.faunaSensingMs / frames),
      sensingCumulativeMs: round1(input.totals.faunaSensingMs),
      targetingMsPerFrame: round1(input.totals.faunaTargetingMs / frames),
      targetingCumulativeMs: round1(input.totals.faunaTargetingMs),
      decisionMsPerFrame: round1(input.totals.faunaDecisionMs / frames),
      decisionCumulativeMs: round1(input.totals.faunaDecisionMs),
      behaviourMsPerFrame: round1(input.totals.faunaBehaviourMs / frames),
      behaviourCumulativeMs: round1(input.totals.faunaBehaviourMs),
      lifePresentationMsPerFrame: round1(input.totals.faunaLifePresentationMs / frames),
      lifePresentationCumulativeMs: round1(input.totals.faunaLifePresentationMs),
      otherUpdateMsPerFrame: round1(Math.max(0,
        faunaAgentMs
        - input.totals.faunaForestSamplingMs / frames
        - input.totals.faunaSensingMs / frames
        - input.totals.faunaTargetingMs / frames
        - input.totals.faunaDecisionMs / frames
        - input.totals.faunaBehaviourMs / frames
        - input.totals.faunaLifePresentationMs / frames,
      )),
      updateCallsPerFrame: round1(input.totals.faunaUpdateCalls / frames),
      sensingPassesPerFrame: round1(input.totals.faunaSensingPasses / frames),
      decisionPassesPerFrame: round1(input.totals.faunaDecisionPasses / frames),
      highPriorityAgentsPerFrame: round1(input.totals.faunaHighPriorityAgents / frames),
      expensiveBehaviourAgentsPerFrame: round1(input.totals.faunaExpensiveBehaviourAgents / frames),
      fullRateAgentsPerFrame: round1(input.totals.faunaFullRateAgents / frames),
      reducedCadenceAgentsPerFrame: round1(input.totals.faunaReducedCadenceAgents / frames),
      behaviourExecutionsPerFrame: round1(input.totals.faunaBehaviourExecutions / frames),
      presentationExecutionsPerFrame: round1(input.totals.faunaPresentationExecutions / frames),
      forestSamplesPerFrame: round1(input.totals.forestSampleCalls / frames),
      fireScanCandidatesPerFrame: round1(input.totals.fireScanCandidates / frames),
      villageScanCandidatesPerFrame: round1(input.totals.villageScanCandidates / frames),
      playerPerceptionChecksPerFrame: round1(input.totals.playerPerceptionChecks / frames),
      nearestScansPerFrame: round1(input.totals.nearestCalls / frames),
      nearestCandidatesPerFrame: round1(input.totals.nearestCandidatesChecked / frames),
      herdLeaderScansPerFrame: round1(input.totals.herdLeaderCalls / frames),
      herdLeaderCandidatesPerFrame: round1(input.totals.herdLeaderCandidatesChecked / frames),
      nearestCalls: input.totals.nearestCalls,
      nearestCandidatesChecked: input.totals.nearestCandidatesChecked,
      herdLeaderCalls: input.totals.herdLeaderCalls,
      herdLeaderCandidatesChecked: input.totals.herdLeaderCandidatesChecked,
      proximityRebuildMsPerFrame: round1(input.totals.faunaProximityRebuildMs / frames),
      spawnerBookkeepingMsPerFrame: round1(input.totals.faunaSpawnerBookkeepingMs / frames),
      proximityQueriesPerFrame: round1(input.totals.faunaProximityQueries / frames),
      proximityCandidatesPerFrame: round1(input.totals.faunaProximityCandidatesVisited / frames),
      waterSampleCallsPerFrame: round1(input.totals.faunaWaterSampleCalls / frames),
      waterSampleMsPerFrame: round1(input.totals.faunaWaterSampleMs / frames),
      waterSampleWorstMs: round1(input.totals.faunaWaterSampleWorstMs),
      colliderQueryCallsPerFrame: round1(input.totals.faunaColliderQueryCalls / frames),
      colliderQueryMsPerFrame: round1(input.totals.faunaColliderQueryMs / frames),
      colliderQueryWorstMs: round1(input.totals.faunaColliderQueryWorstMs),
      colliderQueryReturnedPerFrame: round1(input.totals.faunaColliderQueryReturned / frames),
    },
  }
}

export function formatAgentCpuReport(report: AgentCpuReport): string {
  const { population, npc, fauna } = report
  return [
    '[Seedvale Agent CPU]',
    '',
    'Population:',
    `  NPC (loaded): ${population.npcLoaded}`,
    `  Fauna (agents): ${population.faunaActive}`,
    '',
    'NPC:',
    `  total: ${npc.totalMsPerFrame.toFixed(1)} ms/frame`,
    `  crowd pass: ${npc.crowdPassMsPerFrame.toFixed(1)} ms/frame (${npc.crowdPassCumulativeMs.toFixed(1)} ms cumulative)`,
    `  agent updates: ${npc.agentUpdatesMsPerFrame.toFixed(1)} ms/frame (${npc.agentUpdatesCumulativeMs.toFixed(1)} ms cumulative)`,
    `  livestock: ${npc.livestockMsPerFrame.toFixed(1)} ms/frame (${npc.livestockCumulativeMs.toFixed(1)} ms cumulative)`,
    `    loaded tick: ${npc.livestockLoadedMsPerFrame.toFixed(1)} ms/frame`,
    `    detached tick: ${npc.livestockDetachedMsPerFrame.toFixed(1)} ms/frame`,
    `    unattributed: ${npc.livestockUnattributedMsPerFrame.toFixed(1)} ms/frame`,
    `    animal updates: ${npc.livestockAnimalUpdatesMsPerFrame.toFixed(1)} ms/frame`,
    `    post-update (egg/readyToRemove): ${npc.livestockPostUpdateMsPerFrame.toFixed(1)} ms/frame`,
    `    detached bookkeeping: ${npc.livestockDetachedBookkeepingMsPerFrame.toFixed(1)} ms/frame`,
    '    AnimalAgent sections:',
    `      sensing: ${npc.livestockSensingMsPerFrame.toFixed(1)} ms/frame`,
    `      targeting: ${npc.livestockTargetingMsPerFrame.toFixed(1)} ms/frame`,
    `      decision: ${npc.livestockDecisionMsPerFrame.toFixed(1)} ms/frame`,
    `      behaviour: ${npc.livestockBehaviourMsPerFrame.toFixed(1)} ms/frame`,
    `      life/presentation: ${npc.livestockLifePresentationMsPerFrame.toFixed(1)} ms/frame`,
    `      other update: ${npc.livestockOtherUpdateMsPerFrame.toFixed(1)} ms/frame`,
    `    update calls/frame: ${npc.livestockUpdateCallsPerFrame.toFixed(1)}`,
    `    unique animals/frame: ${npc.livestockUniqueAnimalsPerFrame.toFixed(1)}`,
    `    duplicate updates/frame: ${npc.livestockDuplicateUpdatesPerFrame.toFixed(1)}`,
    `    detached animals/frame: ${npc.livestockDetachedAnimalsPerFrame.toFixed(1)}`,
    `    dog updates/frame: ${npc.livestockDogUpdatesPerFrame.toFixed(1)}`,
    `    dog guard scans: ${npc.livestockDogGuardScansPerFrame.toFixed(1)}/frame (${npc.livestockGuardPredatorCandidatesPerFrame.toFixed(1)} predator candidates/frame)`,
    `    pest scans: ${npc.livestockPestScansPerFrame.toFixed(1)}/frame (${npc.livestockPestRatCandidatesPerFrame.toFixed(1)} rat candidates/frame)`,
    `    nearest scans: ${npc.livestockNearestScansPerFrame.toFixed(1)}/frame (${npc.livestockNearestCandidatesPerFrame.toFixed(1)} candidates/frame)`,
    `    water samples: ${npc.livestockWaterSampleCallsPerFrame.toFixed(1)}/frame, ${npc.livestockWaterSampleMsPerFrame.toFixed(2)} ms/frame (worst call ${npc.livestockWaterSampleWorstMs.toFixed(2)} ms)`,
    `    collider queries: ${npc.livestockColliderQueryCallsPerFrame.toFixed(1)}/frame, ${npc.livestockColliderQueryMsPerFrame.toFixed(2)} ms/frame (worst call ${npc.livestockColliderQueryWorstMs.toFixed(2)} ms, ${npc.livestockColliderQueryReturnedPerFrame.toFixed(1)} colliders/frame)`,
    `    full-rate agents/frame: ${npc.livestockFullRateAgentsPerFrame.toFixed(1)}`,
    `    reduced-cadence agents/frame: ${npc.livestockReducedCadenceAgentsPerFrame.toFixed(1)}`,
    `    behaviour executions/frame: ${npc.livestockBehaviourExecutionsPerFrame.toFixed(1)}`,
    `    presentation executions/frame: ${npc.livestockPresentationExecutionsPerFrame.toFixed(1)}`,
    `  rats: ${npc.ratsMsPerFrame.toFixed(1)} ms/frame (${npc.ratsCumulativeMs.toFixed(1)} ms cumulative)`,
    `  social: ${npc.socialMsPerFrame.toFixed(1)} ms/frame (${npc.socialCumulativeMs.toFixed(1)} ms cumulative)`,
    `  streaming: ${npc.streamingMsPerFrame.toFixed(1)} ms/frame (${npc.streamingCumulativeMs.toFixed(1)} ms cumulative)`,
    `  maintenance: ${npc.maintenanceMsPerFrame.toFixed(1)} ms/frame (${npc.maintenanceCumulativeMs.toFixed(1)} ms cumulative)`,
    `  unattributed: ${npc.unattributedMsPerFrame.toFixed(1)} ms/frame`,
    '',
    'FAUNA:',
    `  total: ${fauna.totalMsPerFrame.toFixed(1)} ms/frame`,
    `  agent updates: ${fauna.agentUpdatesMsPerFrame.toFixed(1)} ms/frame (${fauna.agentUpdatesCumulativeMs.toFixed(1)} ms cumulative)`,
    `  forest sampling: ${fauna.forestSamplingMsPerFrame.toFixed(1)} ms/frame (${fauna.forestSamplingCumulativeMs.toFixed(1)} ms cumulative)`,
    `  other (spawners/forage/cleanup/...): ${fauna.otherMsPerFrame.toFixed(1)} ms/frame`,
    '',
    '  AnimalAgent sections:',
    `    sensing: ${fauna.sensingMsPerFrame.toFixed(1)} ms/frame (${fauna.sensingCumulativeMs.toFixed(1)} ms cumulative)`,
    `    targeting: ${fauna.targetingMsPerFrame.toFixed(1)} ms/frame (${fauna.targetingCumulativeMs.toFixed(1)} ms cumulative)`,
    `    decision: ${fauna.decisionMsPerFrame.toFixed(1)} ms/frame (${fauna.decisionCumulativeMs.toFixed(1)} ms cumulative)`,
    `    behaviour: ${fauna.behaviourMsPerFrame.toFixed(1)} ms/frame (${fauna.behaviourCumulativeMs.toFixed(1)} ms cumulative)`,
    `    life/presentation: ${fauna.lifePresentationMsPerFrame.toFixed(1)} ms/frame (${fauna.lifePresentationCumulativeMs.toFixed(1)} ms cumulative)`,
    `    other update: ${fauna.otherUpdateMsPerFrame.toFixed(1)} ms/frame`,
    '',
    '  adaptive candidates:',
    `    agent updates/frame: ${fauna.updateCallsPerFrame.toFixed(1)}`,
    `    sensing passes/frame: ${fauna.sensingPassesPerFrame.toFixed(1)}`,
    `    decision passes/frame: ${fauna.decisionPassesPerFrame.toFixed(1)}`,
    `    high-priority agents/frame: ${fauna.highPriorityAgentsPerFrame.toFixed(1)}`,
    `    expensive behaviour agents/frame: ${fauna.expensiveBehaviourAgentsPerFrame.toFixed(1)}`,
    `    full-rate agents/frame: ${fauna.fullRateAgentsPerFrame.toFixed(1)}`,
    `    reduced-cadence agents/frame: ${fauna.reducedCadenceAgentsPerFrame.toFixed(1)}`,
    `    behaviour executions/frame: ${fauna.behaviourExecutionsPerFrame.toFixed(1)}`,
    `    presentation executions/frame: ${fauna.presentationExecutionsPerFrame.toFixed(1)}`,
    '',
    '  sensing/cache:',
    `    forest samples/frame: ${fauna.forestSamplesPerFrame.toFixed(1)}`,
    `    fire scan candidates/frame: ${fauna.fireScanCandidatesPerFrame.toFixed(1)}`,
    `    village scan candidates/frame: ${fauna.villageScanCandidatesPerFrame.toFixed(1)}`,
    `    player perception checks/frame: ${fauna.playerPerceptionChecksPerFrame.toFixed(1)}`,
    '',
    `  nearest scans: ${fauna.nearestScansPerFrame.toFixed(1)}/frame (${fauna.nearestCalls} calls)`,
    `  nearest candidates checked: ${fauna.nearestCandidatesPerFrame.toFixed(1)}/frame (${fauna.nearestCandidatesChecked} total)`,
    `  herd leader scans: ${fauna.herdLeaderScansPerFrame.toFixed(1)}/frame (${fauna.herdLeaderCalls} calls)`,
    `  herd candidates checked: ${fauna.herdLeaderCandidatesPerFrame.toFixed(1)}/frame (${fauna.herdLeaderCandidatesChecked} total)`,
    `  proximity rebuild: ${fauna.proximityRebuildMsPerFrame.toFixed(2)} ms/frame`,
    `  spawner bookkeeping: ${fauna.spawnerBookkeepingMsPerFrame.toFixed(2)} ms/frame`,
    `  proximity queries: ${fauna.proximityQueriesPerFrame.toFixed(1)}/frame (${fauna.proximityCandidatesPerFrame.toFixed(1)} candidates/frame)`,
    '',
    '  movement hot-path (plan fauna-033):',
    `    water samples: ${fauna.waterSampleCallsPerFrame.toFixed(1)}/frame, ${fauna.waterSampleMsPerFrame.toFixed(2)} ms/frame (worst call ${fauna.waterSampleWorstMs.toFixed(2)} ms)`,
    `    collider queries: ${fauna.colliderQueryCallsPerFrame.toFixed(1)}/frame, ${fauna.colliderQueryMsPerFrame.toFixed(2)} ms/frame (worst call ${fauna.colliderQueryWorstMs.toFixed(2)} ms, ${fauna.colliderQueryReturnedPerFrame.toFixed(1)} colliders/frame)`,
  ].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
