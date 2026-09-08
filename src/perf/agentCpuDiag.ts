import type { PerfContext } from './types'
import { getMonitor } from './active'
import { PERF_CATEGORY_INDEX } from './types'

/** Cumulative agent-CPU diagnostics for one perf/benchmark session. Cheap
 *  counters and a few `performance.now()` spans — only recorded while
 *  `getMonitor().isEnabled()` (benchmark, `?perf=1`, or GUI toggle). */
export type AgentCpuDiagTotals = {
  npcCrowdMs: number
  npcAgentUpdatesMs: number
  faunaAgentUpdatesMs: number
  nearestCalls: number
  nearestCandidatesChecked: number
  herdLeaderCalls: number
  herdLeaderCandidatesChecked: number
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
    nearestCalls: 0,
    nearestCandidatesChecked: 0,
    herdLeaderCalls: 0,
    herdLeaderCandidatesChecked: 0,
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
    `  other (spawners/forage/cleanup/...): ${fauna.otherMsPerFrame.toFixed(1)} ms/frame`,
    `  nearest scans: ${fauna.nearestScansPerFrame.toFixed(1)}/frame (${fauna.nearestCalls} calls)`,
    `  nearest candidates checked: ${fauna.nearestCandidatesPerFrame.toFixed(1)}/frame (${fauna.nearestCandidatesChecked} total)`,
    `  herd leader scans: ${fauna.herdLeaderScansPerFrame.toFixed(1)}/frame (${fauna.herdLeaderCalls} calls)`,
    `  herd candidates checked: ${fauna.herdLeaderCandidatesPerFrame.toFixed(1)}/frame (${fauna.herdLeaderCandidatesChecked} total)`,
  ].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
