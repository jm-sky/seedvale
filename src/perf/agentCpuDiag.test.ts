import { describe, expect, it } from 'vitest'
import { setActiveMonitor } from './active'
import { buildAgentCpuReport, createAgentCpuDiag, formatAgentCpuReport } from './agentCpuDiag'
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
    diag.beginFaunaAgentUpdates()
    diag.endFaunaAgentUpdates()
    diag.recordNearestScan(8)
    diag.recordNearestScan(4)
    diag.recordHerdLeaderScan(20)

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
        npcCrowdMs: 12,
        npcAgentUpdatesMs: 54,
        faunaAgentUpdatesMs: 81,
        nearestCalls: 100,
        nearestCandidatesChecked: 2000,
        herdLeaderCalls: 50,
        herdLeaderCandidatesChecked: 10000,
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
    expect(report!.fauna.nearestScansPerFrame).toBe(10)
    const text = formatAgentCpuReport(report!)
    expect(text).toContain('[Seedvale Agent CPU]')
    expect(text).toContain('NPC (loaded): 18')
    expect(text).toContain('nearest scans: 10.0/frame (100 calls)')
  })
})
