import { describe, expect, it } from 'vitest'
import { createPerfMonitor } from './monitor'
import { buildReport, formatReport } from './report'
import { PERF_CATEGORY_COUNT } from './types'

describe('createPerfMonitor', () => {
  it('begin/end is a no-op while disabled', () => {
    const mon = createPerfMonitor()
    mon.begin('NPC')
    mon.end('NPC')
    mon.endFrame({ simulateMs: 4, renderMs: 8, drawCalls: 10, triangles: 100 })
    expect(mon.isEnabled()).toBe(false)
    expect(mon.getLiveStats().p95).toBe(0)
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
        categoryMsSum,
        spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
        hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
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
    const text = formatReport(report)
    expect(text).toContain('[Seedvale Benchmark]')
    expect(text).toContain('Recommendation:')
    expect(text.split('[Seedvale Benchmark]').length).toBe(2)
  })
})
