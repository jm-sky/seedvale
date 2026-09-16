import { describe, expect, it } from 'vitest'
import { setActiveMonitor } from './active'
import { buildAgentCpuReport, createAgentCpuDiag, emptyAgentCpuDiagTotals, formatAgentCpuReport } from './agentCpuDiag'
import { createPerfMonitor } from './monitor'
import { PERF_CATEGORY_COUNT, PERF_CATEGORY_INDEX } from './types'

describe('agentCpuDiag', () => {
  it('is a no-op while perf monitoring is disabled', () => {
    const monitor = createPerfMonitor()
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()
    diag.beginNpcCrowd()
    diag.endNpcCrowd()
    diag.recordNearestScan(12)
    expect(diag.snapshot().npcCrowdMs).toBe(0)
    expect(diag.snapshot().nearestCalls).toBe(0)
    setActiveMonitor(null)
  })

  it('accumulates timings and counters while enabled', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()

    diag.beginNpcCrowd()
    diag.endNpcCrowd()
    diag.beginNpcAgentUpdates()
    diag.endNpcAgentUpdates()
    diag.beginNpcLivestock()
    diag.endNpcLivestock()
    diag.beginNpcRats()
    diag.endNpcRats()
    diag.beginNpcSocial()
    diag.endNpcSocial()
    diag.beginNpcStreaming()
    diag.endNpcStreaming()
    diag.beginNpcMaintenance()
    diag.endNpcMaintenance()
    diag.beginFaunaAgentUpdates()
    diag.endFaunaAgentUpdates()
    diag.beginFaunaAgentUpdates()
    diag.recordNearestScan(8)
    diag.recordNearestScan(4)
    diag.recordHerdLeaderScan(20)
    diag.endFaunaAgentUpdates()

    const totals = diag.snapshot()
    expect(totals.nearestCalls).toBe(2)
    expect(totals.nearestCandidatesChecked).toBe(12)
    expect(totals.herdLeaderCalls).toBe(1)
    expect(totals.herdLeaderCandidatesChecked).toBe(20)
    setActiveMonitor(null)
  })

  it('builds and formats a per-frame report', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[PERF_CATEGORY_INDEX.NPC] = 86
    categoryMsSum[PERF_CATEGORY_INDEX.FAUNA] = 96
    const report = buildAgentCpuReport({
      frames: 10,
      totals: {
        ...emptyAgentCpuDiagTotals(),
        npcCrowdMs: 12,
        npcAgentUpdatesMs: 54,
        npcLivestockMs: 8,
        npcLivestockLoadedMs: 6,
        npcLivestockDetachedMs: 2,
        livestockAnimalUpdatesMs: 10,
        livestockPostUpdateMs: 0.5,
        livestockDetachedBookkeepingMs: 0.4,
        livestockSensingMs: 0.5,
        livestockTargetingMs: 0.4,
        livestockDecisionMs: 0.3,
        livestockBehaviourMs: 4,
        livestockLifePresentationMs: 1.5,
        livestockUpdateCalls: 80,
        livestockUniqueAnimals: 70,
        livestockDuplicateUpdates: 10,
        livestockDetachedAnimals: 20,
        livestockDogUpdates: 10,
        livestockDogGuardScans: 10,
        livestockGuardPredatorCandidates: 30,
        livestockPestScans: 8,
        livestockPestRatCandidates: 40,
        livestockNearestCalls: 70,
        livestockNearestCandidatesChecked: 350,
        npcRatsMs: 4,
        npcSocialMs: 1,
        npcStreamingMs: 5,
        npcMaintenanceMs: 2,
        faunaAgentUpdatesMs: 81,
        faunaForestSamplingMs: 6,
        faunaSensingMs: 15,
        faunaTargetingMs: 4,
        faunaDecisionMs: 8,
        faunaBehaviourMs: 40,
        faunaLifePresentationMs: 8,
        nearestCalls: 100,
        nearestCandidatesChecked: 2000,
        herdLeaderCalls: 50,
        herdLeaderCandidatesChecked: 10000,
        faunaUpdateCalls: 220,
        faunaSensingPasses: 220,
        faunaDecisionPasses: 200,
        faunaHighPriorityAgents: 30,
        faunaExpensiveBehaviourAgents: 150,
        forestSampleCalls: 220,
        fireScanCandidates: 440,
        villageScanCandidates: 660,
        playerPerceptionChecks: 220,
      },
      categoryMsSum,
      context: {
        loadedChunks: 49,
        npcCount: 18,
        faunaCount: 24,
        pixelRatio: 1,
        quality: 'High',
      },
    })
    expect(report).not.toBeNull()
    expect(report!.npc.totalMsPerFrame).toBe(8.6)
    expect(report!.npc.crowdPassMsPerFrame).toBe(1.2)
    expect(report!.npc.livestockMsPerFrame).toBe(0.8)
    expect(report!.npc.ratsMsPerFrame).toBe(0.4)
    expect(report!.npc.socialMsPerFrame).toBe(0.1)
    expect(report!.npc.streamingMsPerFrame).toBe(0.5)
    expect(report!.npc.maintenanceMsPerFrame).toBe(0.2)
    expect(report!.npc.unattributedMsPerFrame).toBe(0)
    expect(report!.fauna.nearestScansPerFrame).toBe(10)
    expect(report!.fauna.forestSamplingMsPerFrame).toBe(0.6)
    expect(report!.fauna.behaviourMsPerFrame).toBe(4)
    expect(report!.fauna.updateCallsPerFrame).toBe(22)
    expect(report!.fauna.expensiveBehaviourAgentsPerFrame).toBe(15)
    expect(report!.npc.livestockOtherUpdateMsPerFrame).toBe(0.3)
    expect(report!.fauna.otherUpdateMsPerFrame).toBe(0)
    const text = formatAgentCpuReport(report!)
    expect(text).toContain('[Seedvale Agent CPU]')
    expect(text).toContain('NPC (loaded): 18')
    expect(text).toContain('livestock: 0.8 ms/frame (8.0 ms cumulative)')
    expect(text).toContain('loaded tick: 0.6 ms/frame')
    expect(text).toContain('detached tick: 0.2 ms/frame')
    expect(text).toContain('animal updates: 1.0 ms/frame')
    expect(text).toContain('duplicate updates/frame: 1.0')
    expect(text).toContain('rats: 0.4 ms/frame (4.0 ms cumulative)')
    expect(text).toContain('social: 0.1 ms/frame (1.0 ms cumulative)')
    expect(text).toContain('streaming: 0.5 ms/frame (5.0 ms cumulative)')
    expect(text).toContain('maintenance: 0.2 ms/frame (2.0 ms cumulative)')
    expect(text).toContain('unattributed: 0.0 ms/frame')
    expect(text).toContain('nearest scans: 10.0/frame (100 calls)')
    expect(text).toContain('AnimalAgent sections:')
    expect(text).toContain('behaviour: 4.0 ms/frame (40.0 ms cumulative)')
    expect(text).toContain('other update: 0.3 ms/frame')
    expect(text).toContain('other update: 0.0 ms/frame')
    expect(text).toContain('expensive behaviour agents/frame: 15.0')
  })

  it('copies AnimalAgent section deltas onto livestock totals while the livestock channel is open', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()

    diag.beginLivestockFrame()
    diag.enterLivestockAgentUpdates()
    diag.recordLivestockAgentUpdate('cow-1', false)
    diag.recordLivestockAgentUpdate('dog-1', true)
    diag.recordLivestockAgentUpdate('cow-1', false)
    diag.addFaunaSensingMs(2)
    diag.addFaunaTargetingMs(1)
    diag.recordNearestScan(4)
    diag.recordLivestockGuardScan(3)
    diag.leaveLivestockAgentUpdates()
    diag.addFaunaBehaviourMs(9)
    diag.recordNearestScan(8)
    diag.endLivestockFrame()

    const totals = diag.snapshot()
    expect(totals.livestockUpdateCalls).toBe(3)
    expect(totals.livestockDuplicateUpdates).toBe(1)
    expect(totals.livestockDogUpdates).toBe(1)
    expect(totals.livestockSensingMs).toBe(2)
    expect(totals.livestockTargetingMs).toBe(1)
    expect(totals.livestockBehaviourMs).toBe(0)
    expect(totals.faunaSensingMs).toBe(0)
    expect(totals.faunaTargetingMs).toBe(0)
    expect(totals.faunaBehaviourMs).toBe(0)
    expect(totals.livestockNearestCalls).toBe(1)
    expect(totals.livestockNearestCandidatesChecked).toBe(4)
    expect(totals.nearestCalls).toBe(0)
    expect(totals.livestockDogGuardScans).toBe(1)
    expect(totals.livestockGuardPredatorCandidates).toBe(3)
    expect(totals.livestockUniqueAnimals).toBe(2)
    setActiveMonitor(null)
  })

  it('routes wild-fauna AnimalAgent deltas only to FAUNA counters', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()

    diag.beginFaunaAgentUpdates()
    diag.recordFaunaUpdateCall()
    diag.addFaunaSensingMs(3)
    diag.addFaunaBehaviourMs(5)
    diag.addFaunaLifePresentationMs(4)
    diag.recordNearestScan(7)
    diag.endFaunaAgentUpdates()

    const totals = diag.snapshot()
    expect(totals.faunaSensingMs).toBe(3)
    expect(totals.faunaBehaviourMs).toBe(5)
    expect(totals.faunaLifePresentationMs).toBe(4)
    expect(totals.faunaUpdateCalls).toBe(1)
    expect(totals.nearestCalls).toBe(1)
    expect(totals.livestockSensingMs).toBe(0)
    expect(totals.livestockBehaviourMs).toBe(0)
    expect(totals.livestockLifePresentationMs).toBe(0)
    expect(totals.livestockNearestCalls).toBe(0)
    setActiveMonitor(null)
  })

  it('does not leak livestock or unscoped (rats) deltas into FAUNA counters', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()

    diag.enterLivestockAgentUpdates()
    diag.addFaunaBehaviourMs(2)
    diag.addFaunaLifePresentationMs(3)
    diag.recordFaunaUpdateCall()
    diag.leaveLivestockAgentUpdates()
    diag.addFaunaBehaviourMs(11)
    diag.addFaunaLifePresentationMs(13)
    diag.recordFaunaUpdateCall()
    diag.recordNearestScan(9)

    const totals = diag.snapshot()
    expect(totals.livestockBehaviourMs).toBe(2)
    expect(totals.livestockLifePresentationMs).toBe(3)
    expect(totals.faunaBehaviourMs).toBe(0)
    expect(totals.faunaLifePresentationMs).toBe(0)
    expect(totals.faunaUpdateCalls).toBe(0)
    expect(totals.nearestCalls).toBe(0)
    setActiveMonitor(null)
  })

  it('routes movement hot-path (water sample / collider query) deltas to the right channel and tracks the worst call (plan fauna-033)', () => {
    const monitor = createPerfMonitor()
    monitor.setSource('benchmark', true)
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()

    diag.beginFaunaAgentUpdates()
    diag.addFaunaWaterSampleMs(1)
    diag.addFaunaWaterSampleMs(3)
    diag.addFaunaColliderQueryMs(0.5, 4)
    diag.addFaunaColliderQueryMs(2, 9)
    diag.endFaunaAgentUpdates()

    diag.enterLivestockAgentUpdates()
    diag.addFaunaWaterSampleMs(5)
    diag.addFaunaColliderQueryMs(1, 6)
    diag.leaveLivestockAgentUpdates()

    // Outside any channel — must not leak into either counter (matches the
    // existing "neither" rule for unscoped callers, e.g. settlement rats).
    diag.addFaunaWaterSampleMs(99)
    diag.addFaunaColliderQueryMs(99, 99)

    const totals = diag.snapshot()
    expect(totals.faunaWaterSampleCalls).toBe(2)
    expect(totals.faunaWaterSampleMs).toBe(4)
    expect(totals.faunaWaterSampleWorstMs).toBe(3)
    expect(totals.faunaColliderQueryCalls).toBe(2)
    expect(totals.faunaColliderQueryMs).toBe(2.5)
    expect(totals.faunaColliderQueryWorstMs).toBe(2)
    expect(totals.faunaColliderQueryReturned).toBe(13)
    expect(totals.livestockWaterSampleCalls).toBe(1)
    expect(totals.livestockWaterSampleMs).toBe(5)
    expect(totals.livestockColliderQueryCalls).toBe(1)
    expect(totals.livestockColliderQueryReturned).toBe(6)
    setActiveMonitor(null)
  })

  it('is a no-op for movement hot-path counters while perf monitoring is disabled', () => {
    const monitor = createPerfMonitor()
    setActiveMonitor(monitor)
    const diag = createAgentCpuDiag()
    diag.addFaunaWaterSampleMs(5)
    diag.addFaunaColliderQueryMs(5, 10)
    const totals = diag.snapshot()
    expect(totals.faunaWaterSampleCalls).toBe(0)
    expect(totals.faunaColliderQueryCalls).toBe(0)
    setActiveMonitor(null)
  })

  it('keeps other update non-negative when section sums exceed the wall-clock', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[PERF_CATEGORY_INDEX.NPC] = 50
    categoryMsSum[PERF_CATEGORY_INDEX.FAUNA] = 80
    const report = buildAgentCpuReport({
      frames: 10,
      totals: {
        ...emptyAgentCpuDiagTotals(),
        npcLivestockMs: 40,
        livestockAnimalUpdatesMs: 30,
        livestockSensingMs: 10,
        livestockTargetingMs: 10,
        livestockDecisionMs: 10,
        livestockBehaviourMs: 20,
        livestockLifePresentationMs: 20,
        faunaAgentUpdatesMs: 80,
        faunaForestSamplingMs: 10,
        faunaSensingMs: 20,
        faunaTargetingMs: 20,
        faunaDecisionMs: 20,
        faunaBehaviourMs: 40,
        faunaLifePresentationMs: 40,
      },
      categoryMsSum,
      context: {
        loadedChunks: 1,
        npcCount: 1,
        faunaCount: 1,
        pixelRatio: 1,
        quality: 'High',
      },
    })
    expect(report).not.toBeNull()
    expect(report!.npc.livestockOtherUpdateMsPerFrame).toBe(0)
    expect(report!.fauna.otherUpdateMsPerFrame).toBe(0)
    expect(report!.npc.livestockBehaviourMsPerFrame).toBe(2)
    expect(report!.fauna.behaviourMsPerFrame).toBe(4)
  })
})
