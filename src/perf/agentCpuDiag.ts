import type { PerfContext } from './types'
import { getMonitor } from './active'
import { PERF_CATEGORY_INDEX } from './types'

/** Cumulative agent-CPU diagnostics for one perf/benchmark session. Cheap
 *  counters and a few `performance.now()` spans — only recorded while
 *  `getMonitor().isEnabled()` (benchmark, `?perf=1`, or GUI toggle).
 *
 *  Fauna's `AnimalAgent.update()` breakdown (fauna-cpu-diagnostics) uses a
 *  handful of *cumulative* spans rather than per-function profiling — each
 *  `addFauna*Ms` call adds one timed region's elapsed time onto a running
 *  total, so one logical section (e.g. "targeting") can be measured across
 *  two or more non-adjacent call sites inside `update()` without extra
 *  begin/end state. */
export type AgentCpuDiagTotals = {
  npcCrowdMs: number
  npcAgentUpdatesMs: number
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
  /** Adaptive-simulation candidates (fauna-cpu-diagnostics) — cheap
   *  per-frame counters, not a new telemetry system. */
  faunaUpdateCalls: number
  faunaSensingPasses: number
  faunaDecisionPasses: number
  faunaHighPriorityAgents: number
  faunaExpensiveBehaviourAgents: number
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
    otherMsPerFrame: number
    crowdPassCumulativeMs: number
    agentUpdatesCumulativeMs: number
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
    updateCallsPerFrame: number
    sensingPassesPerFrame: number
    decisionPassesPerFrame: number
    highPriorityAgentsPerFrame: number
    expensiveBehaviourAgentsPerFrame: number
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
  }
}

export type AgentCpuDiag = {
  isEnabled: () => boolean
  beginNpcCrowd: () => void
  endNpcCrowd: () => void
  beginNpcAgentUpdates: () => void
  endNpcAgentUpdates: () => void
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
  recordForestSample: () => void
  recordFireScan: (candidatesChecked: number) => void
  recordVillageScan: (candidatesChecked: number) => void
  recordPlayerPerceptionCheck: () => void
  recordNearestScan: (candidatesChecked: number) => void
  recordHerdLeaderScan: (candidatesChecked: number) => void
  snapshot: () => AgentCpuDiagTotals
  reset: () => void
}

function emptyTotals(): AgentCpuDiagTotals {
  return {
    npcCrowdMs: 0,
    npcAgentUpdatesMs: 0,
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
    faunaUpdateCalls: 0,
    faunaSensingPasses: 0,
    faunaDecisionPasses: 0,
    faunaHighPriorityAgents: 0,
    faunaExpensiveBehaviourAgents: 0,
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
  let faunaAgentStart = Number.NaN

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
    beginFaunaAgentUpdates() {
      if (!this.isEnabled()) return
      faunaAgentStart = performance.now()
    },
    endFaunaAgentUpdates() {
      if (!this.isEnabled() || !Number.isFinite(faunaAgentStart)) return
      totals.faunaAgentUpdatesMs += performance.now() - faunaAgentStart
      faunaAgentStart = Number.NaN
    },
    addFaunaForestSamplingMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaForestSamplingMs += ms
    },
    addFaunaSensingMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaSensingMs += ms
    },
    addFaunaTargetingMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaTargetingMs += ms
    },
    addFaunaDecisionMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaDecisionMs += ms
    },
    addFaunaBehaviourMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaBehaviourMs += ms
    },
    addFaunaLifePresentationMs(ms) {
      if (!this.isEnabled()) return
      totals.faunaLifePresentationMs += ms
    },
    recordFaunaUpdateCall() {
      if (!this.isEnabled()) return
      totals.faunaUpdateCalls++
    },
    recordFaunaSensingPass() {
      if (!this.isEnabled()) return
      totals.faunaSensingPasses++
    },
    recordFaunaDecisionPass() {
      if (!this.isEnabled()) return
      totals.faunaDecisionPasses++
    },
    recordFaunaHighPriorityAgent() {
      if (!this.isEnabled()) return
      totals.faunaHighPriorityAgents++
    },
    recordFaunaExpensiveBehaviourAgent() {
      if (!this.isEnabled()) return
      totals.faunaExpensiveBehaviourAgents++
    },
    recordForestSample() {
      if (!this.isEnabled()) return
      totals.forestSampleCalls++
    },
    recordFireScan(candidatesChecked) {
      if (!this.isEnabled()) return
      totals.fireScanCandidates += candidatesChecked
    },
    recordVillageScan(candidatesChecked) {
      if (!this.isEnabled()) return
      totals.villageScanCandidates += candidatesChecked
    },
    recordPlayerPerceptionCheck() {
      if (!this.isEnabled()) return
      totals.playerPerceptionChecks++
    },
    recordNearestScan(candidatesChecked) {
      if (!this.isEnabled()) return
      totals.nearestCalls++
      totals.nearestCandidatesChecked += candidatesChecked
    },
    recordHerdLeaderScan(candidatesChecked) {
      if (!this.isEnabled()) return
      totals.herdLeaderCalls++
      totals.herdLeaderCandidatesChecked += candidatesChecked
    },
    snapshot: () => ({ ...totals }),
    reset() {
      Object.assign(totals, emptyTotals())
      npcCrowdStart = Number.NaN
      npcAgentStart = Number.NaN
      faunaAgentStart = Number.NaN
    },
  }
}

const NOOP: AgentCpuDiag = {
  isEnabled: () => false,
  beginNpcCrowd: () => {},
  endNpcCrowd: () => {},
  beginNpcAgentUpdates: () => {},
  endNpcAgentUpdates: () => {},
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
  recordForestSample: () => {},
  recordFireScan: () => {},
  recordVillageScan: () => {},
  recordPlayerPerceptionCheck: () => {},
  recordNearestScan: () => {},
  recordHerdLeaderScan: () => {},
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
  const faunaAgentMs = input.totals.faunaAgentUpdatesMs / frames

  const hasNpc = npcTotalMs >= 0.01 || crowdMs >= 0.01 || npcAgentMs >= 0.01
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
      otherMsPerFrame: round1(Math.max(0, npcTotalMs - crowdMs - npcAgentMs)),
      crowdPassCumulativeMs: round1(input.totals.npcCrowdMs),
      agentUpdatesCumulativeMs: round1(input.totals.npcAgentUpdatesMs),
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
      updateCallsPerFrame: round1(input.totals.faunaUpdateCalls / frames),
      sensingPassesPerFrame: round1(input.totals.faunaSensingPasses / frames),
      decisionPassesPerFrame: round1(input.totals.faunaDecisionPasses / frames),
      highPriorityAgentsPerFrame: round1(input.totals.faunaHighPriorityAgents / frames),
      expensiveBehaviourAgentsPerFrame: round1(input.totals.faunaExpensiveBehaviourAgents / frames),
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
    `  other (livestock/rats/social/...): ${npc.otherMsPerFrame.toFixed(1)} ms/frame`,
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
    '',
    '  adaptive candidates:',
    `    agent updates/frame: ${fauna.updateCallsPerFrame.toFixed(1)}`,
    `    sensing passes/frame: ${fauna.sensingPassesPerFrame.toFixed(1)}`,
    `    decision passes/frame: ${fauna.decisionPassesPerFrame.toFixed(1)}`,
    `    high-priority agents/frame: ${fauna.highPriorityAgentsPerFrame.toFixed(1)}`,
    `    expensive behaviour agents/frame: ${fauna.expensiveBehaviourAgentsPerFrame.toFixed(1)}`,
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
  ].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
