import { describe, expect, it, vi } from 'vitest'
import { buildAgentCpuReport, emptyAgentCpuDiagTotals } from './agentCpuDiag'
import { formatLongFrameAttribution } from './longFrameFormat'
import { createPerfMonitor } from './monitor'
import { buildReport, formatReport } from './report'
import { LONG_FRAME_MS, PERF_CATEGORY_COUNT, PERF_CATEGORY_INDEX } from './types'

describe('createPerfMonitor', () => {
  it('begin/end is a no-op while disabled', () => {
    const mon = createPerfMonitor()
    mon.begin('NPC')
    mon.end('NPC')
    mon.endFrame({ simulateMs: 4, renderMs: 8, drawCalls: 10, triangles: 100 })
    expect(mon.isEnabled()).toBe(false)
    expect(mon.getLiveStats().p95).toBe(0)
  })

  it('aggregates hitch labels during a session', () => {
    const mon = createPerfMonitor()
    mon.setSource('gui', true)
    mon.beginSession()
    mon.recordHitch('STREAMING', 20, 'chunk mesh')
    mon.recordHitch('STREAMING', 12, 'chunk mesh')
    mon.recordHitch('GRASS', 40, 'grass generation')
    mon.endFrame({ simulateMs: 4, renderMs: 8, drawCalls: 200, triangles: 50000 })
    const totals = mon.endSession()
    const mesh = totals.hitchByLabel.get('STREAMING:chunk mesh')
    expect(mesh?.count).toBe(2)
    expect(mesh?.maxMs).toBe(20)
    expect(totals.hitchByLabel.get('GRASS:grass generation')?.count).toBe(1)
  })

  it('dumps a long-frame attribution with OTHER remainder and stages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mon = createPerfMonitor()
    mon.setSource('gui', true)
    mon.beginSession()
    mon.recordStage('riverTileBuild', 90)
    mon.recordStage('riverChannelSegmentsNear', 12)
    mon.recordHitch('STREAMING', 90, 'chunk mesh')
    mon.endFrame({ simulateMs: 110, renderMs: 8, drawCalls: 10, triangles: 100 })
    const totals = mon.endSession()
    expect(totals.longFrames).toHaveLength(1)
    const frame = totals.longFrames[0]!
    expect(frame.frameMs).toBeGreaterThanOrEqual(LONG_FRAME_MS)
    expect(frame.otherMs).toBeGreaterThan(10)
    expect(frame.stages.map((s) => s.label)).toEqual(['riverTileBuild', 'riverChannelSegmentsNear'])
    expect(frame.hitches[0]?.label).toBe('chunk mesh')
    const dump = warn.mock.calls.map((call) => String(call[0])).find((text) => text.includes('[LONG FRAME]'))
    expect(dump).toContain('[LONG FRAME]')
    expect(dump).toContain('OTHER')
    expect(dump).toContain('riverTileBuild')
    warn.mockRestore()
  })

  it('does not dump frames below the long-frame threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mon = createPerfMonitor()
    mon.setSource('gui', true)
    mon.beginSession()
    mon.recordStage('chunkUpdate', 4)
    mon.endFrame({ simulateMs: 10, renderMs: 6, drawCalls: 10, triangles: 100 })
    const totals = mon.endSession()
    expect(totals.longFrames).toHaveLength(0)
    expect(warn.mock.calls.some((call) => String(call[0]).includes('[LONG FRAME]'))).toBe(false)
    warn.mockRestore()
  })

  it('aggregates frame times once enabled', () => {
    const mon = createPerfMonitor()
    mon.setSource('gui', true)
    for (let i = 0; i < 40; i++) {
      mon.begin('RENDER')
      mon.end('RENDER')
      mon.endFrame({
        simulateMs: 4,
        renderMs: 8 + i * 0.1,
        drawCalls: 100,
        triangles: 1000,
      })
    }
    const stats = mon.getLiveStats()
    expect(stats.enabled).toBe(true)
    expect(stats.p50).toBeGreaterThan(0)
    expect(stats.p95).toBeGreaterThanOrEqual(stats.p50)
  })
})

describe('buildReport', () => {
  it('emits a stable JSON shape and a single text block', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[11] = 80
    const report = buildReport({
      durationSec: 30,
      scenario: 'current',
      totals: {
        frames: 10,
        frameMsSum: 170,
        frameMsMin: 14,
        frameMsMax: 22,
        frameMs: [14, 15, 16, 16, 17, 17, 18, 18, 19, 22],
        drawCallsSum: 10000,
        drawCallsMax: 1200,
        trianglesSum: 10_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
      context: {
        loadedChunks: 49,
        npcCount: 8,
        faunaCount: 12,
        pixelRatio: 2,
        quality: 'High',
      },
    })
    expect(report.fps.avg).toBeGreaterThan(50)
    expect(report.systems.RENDER).toBe(8)
    expect(report.bottlenecks[0]).toBe('RENDER')
    expect(report.rendering.drawCallsAvg).toBe(1000)
    expect(report.rendering.trianglesAvg).toBe(1_000_000)
    expect(report.canonical).toBe(true)
    // RENDER can include GPU wait — not a confirmed CPU bottleneck on its own.
    expect(report.recommendation).toContain('GPU wait')
    const text = formatReport(report)
    expect(text).toContain('[Seedvale Benchmark]')
    expect(text).toContain('Recommendation:')
    expect(text.split('[Seedvale Benchmark]').length).toBe(2)
  })

  it('marks current as non-canonical', () => {
    const report = buildReport({
      durationSec: 30,
      scenario: 'current',
      canonical: false,
      totals: {
        frames: 10,
        frameMsSum: 170,
        frameMsMin: 14,
        frameMsMax: 22,
        frameMs: [14, 15, 16, 16, 17, 17, 18, 18, 19, 22],
        drawCallsSum: 10000,
        drawCallsMax: 1200,
        trianglesSum: 10_000_000,
        renderCategoryMs: [],
        categoryMsSum: new Float64Array(PERF_CATEGORY_COUNT),
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
    })
    expect(report.canonical).toBe(false)
    expect(formatReport(report)).toContain('non-canonical')
  })

  it('reports a large unattributed frame spike instead of blaming a CPU category', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[7] = 20 // STREAMING — small sustained cost
    const frameMs = new Array(29).fill(16)
    frameMs.push(800) // one huge, unexplained frame (evidence from real stream runs)
    const report = buildReport({
      durationSec: 30,
      scenario: 'stream',
      totals: {
        frames: frameMs.length,
        frameMsSum: frameMs.reduce((a, b) => a + b, 0),
        frameMsMin: 16,
        frameMsMax: 800,
        frameMs,
        drawCallsSum: 3000,
        drawCallsMax: 200,
        trianglesSum: 1_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        // Largest labelled hitch (chunk-mesh, ~52 ms) is far below the 800 ms frame.
        hitchByLabel: new Map([
          ['STREAMING:chunk mesh', { category: 'STREAMING' as const, label: 'chunk mesh', count: 3, sumMs: 120, maxMs: 52 }],
        ]),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
    })
    expect(report.attribution.frameMaxMs).toBe(800)
    expect(report.attribution.largestHitchMs).toBe(52)
    expect(report.attribution.unattributedMs).toBeCloseTo(748, 0)
    expect(report.recommendation).toContain('unattributed')
  })

  it('includes the agent CPU section when provided', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[PERF_CATEGORY_INDEX.NPC] = 30
    categoryMsSum[PERF_CATEGORY_INDEX.FAUNA] = 40
    const agentCpu = buildAgentCpuReport({
      frames: 10,
      totals: {
        ...emptyAgentCpuDiagTotals(),
        npcCrowdMs: 5,
        npcAgentUpdatesMs: 15,
        npcLivestockMs: 3,
        npcRatsMs: 2,
        npcSocialMs: 0,
        npcStreamingMs: 1,
        npcMaintenanceMs: 1,
        faunaAgentUpdatesMs: 30,
        faunaForestSamplingMs: 2,
        faunaSensingMs: 6,
        faunaTargetingMs: 1,
        faunaDecisionMs: 3,
        faunaBehaviourMs: 15,
        faunaLifePresentationMs: 3,
        nearestCalls: 20,
        nearestCandidatesChecked: 400,
        herdLeaderCalls: 10,
        herdLeaderCandidatesChecked: 2000,
        faunaUpdateCalls: 120,
        faunaSensingPasses: 120,
        faunaDecisionPasses: 110,
        faunaHighPriorityAgents: 15,
        faunaExpensiveBehaviourAgents: 80,
        forestSampleCalls: 120,
        fireScanCandidates: 200,
        villageScanCandidates: 300,
        playerPerceptionChecks: 120,
      },
      categoryMsSum,
      context: {
        loadedChunks: 49,
        npcCount: 8,
        faunaCount: 12,
        pixelRatio: 1,
        quality: 'High',
      },
    })
    const report = buildReport({
      durationSec: 30,
      scenario: 'stream',
      agentCpu,
      totals: {
        frames: 10,
        frameMsSum: 170,
        frameMsMin: 14,
        frameMsMax: 22,
        frameMs: [14, 15, 16, 16, 17, 17, 18, 18, 19, 22],
        drawCallsSum: 10000,
        drawCallsMax: 1200,
        trianglesSum: 10_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
    })
    const text = formatReport(report)
    expect(text).toContain('[Seedvale Agent CPU]')
    expect(text).toContain('crowd pass:')
    expect(text).toContain('livestock:')
    expect(text).toContain('unattributed:')
    expect(text).toContain('nearest scans:')
  })

  it('includes long-frame attribution in the JSON report and copy-friendly dump', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    categoryMsSum[PERF_CATEGORY_INDEX.STREAMING] = 2000
    const report = buildReport({
      durationSec: 30,
      scenario: 'stream',
      totals: {
        frames: 2,
        frameMsSum: 2130,
        frameMsMin: 16,
        frameMsMax: 2113,
        frameMs: [16, 2113],
        drawCallsSum: 200,
        drawCallsMax: 120,
        trianglesSum: 1_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 1,
        longFrames: [{
          frameMs: 2113,
          simulateMs: 2080,
          renderMs: 33,
          categoryMs: { STREAMING: 2041, RENDER: 31, NPC: 18, FAUNA: 7, PHYSICS: 3 },
          otherMs: 13,
          stages: [
            { label: 'chunkUpdate', ms: 2038 },
            { label: 'riverTileBuild', ms: 1972 },
            { label: 'riverChannelSegmentsNear', ms: 54 },
            { label: 'terrainFinalize', ms: 41 },
            { label: 'waterFinalize', ms: 12 },
          ],
          hitches: [{ category: 'STREAMING', durationMs: 41, atMs: 0, label: 'chunk mesh' }],
        }],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
    })
    expect(report.longFrames?.count).toBe(1)
    expect(report.longFrames?.thresholdMs).toBe(LONG_FRAME_MS)
    expect(report.longFrames?.worst[0]?.stages[0]?.label).toBe('chunkUpdate')
    expect(formatReport(report)).toContain('Long frames:')
    expect(formatReport(report)).toContain('worst: 2113 ms')
    const dump = formatLongFrameAttribution(report.longFrames)
    expect(dump).toContain('[Seedvale Long Frame Attribution]')
    expect(dump).toContain('[LONG FRAME] 2113ms')
    expect(dump).toContain('riverTileBuild')
    expect(dump).toContain('OTHER')
  })

  it('includes scenarioSettlement identity in the reproducibility section', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    const report = buildReport({
      durationSec: 30,
      scenario: 'settlement-heavy',
      totals: {
        frames: 2,
        frameMsSum: 40,
        frameMsMin: 16,
        frameMsMax: 24,
        frameMs: [16, 24],
        drawCallsSum: 200,
        drawCallsMax: 120,
        trianglesSum: 1_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
      context: {
        loadedChunks: 49,
        npcCount: 40,
        faunaCount: 12,
        pixelRatio: 1,
        quality: 'High',
        scenarioAnchor: { x: 560, z: -280 },
        scenarioSettlement: {
          id: '2_-1',
          name: 'Highpeak',
          terrain: 'mountain',
          size: 'XL',
          familyCount: 8,
          residentCount: 24,
          x: 560,
          z: -280,
        },
      },
    })
    const text = formatReport(report)
    expect(text).toContain('settlement: Highpeak (2_-1)')
    expect(text).toContain('terrain=mountain')
    expect(text).toContain('size=XL')
    expect(text).toContain('families=8')
    expect(text).toContain('residents=24')
  })

  it('omits settlement identity when scenarioSettlement is absent', () => {
    const categoryMsSum = new Float64Array(PERF_CATEGORY_COUNT)
    const report = buildReport({
      durationSec: 30,
      scenario: 'settlement',
      totals: {
        frames: 2,
        frameMsSum: 40,
        frameMsMin: 16,
        frameMsMax: 24,
        frameMs: [16, 24],
        drawCallsSum: 200,
        drawCallsMax: 120,
        trianglesSum: 1_000_000,
        renderCategoryMs: [],
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchByLabel: new Map(),
        longFrameCount: 0,
        longFrames: [],
        mirrorDrawCallsSum: 0,
        geometriesLast: 0,
        texturesLast: 0,
      },
      context: {
        loadedChunks: 49,
        npcCount: 8,
        faunaCount: 12,
        pixelRatio: 1,
        quality: 'High',
        scenarioAnchor: { x: 0, z: 0 },
      },
    })
    expect(formatReport(report)).not.toContain('settlement:')
  })
})
