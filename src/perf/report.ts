import type { SessionTotals } from './monitor'
import type { PerfContext, PerfReportJson } from './types'
import { percentile } from './percentile'
import { PERF_CATEGORIES, PERF_CATEGORY_COUNT } from './types'

const EMPTY_CONTEXT: PerfContext = {
  loadedChunks: 0,
  npcCount: 0,
  faunaCount: 0,
  pixelRatio: 1,
  quality: 'High',
}

export function buildReport(input: {
  durationSec: number
  scenario: string
  totals: SessionTotals
  context?: PerfContext
}): PerfReportJson {
  const { totals, durationSec, scenario } = input
  const n = Math.max(1, totals.frames)
  const ctx = input.context ?? EMPTY_CONTEXT
  const sorted = Float64Array.from(totals.frameMs)
  sorted.sort()
  const avgMs = totals.frameMsSum / n
  const fpsAvg = avgMs > 0 ? 1000 / avgMs : 0
  const fpsMin = totals.frameMsMax > 0 ? 1000 / totals.frameMsMax : 0
  const p1Ms = percentile(sorted, sorted.length, 99)
  const fpsP1 = p1Ms > 0 ? 1000 / p1Ms : 0

  const systems: PerfReportJson['systems'] = {}
  const ranked: { name: string; ms: number }[] = []
  for (let i = 0; i < PERF_CATEGORY_COUNT; i++) {
    const ms = totals.categoryMsSum[i]! / n
    if (ms < 0.05) continue
    const name = PERF_CATEGORIES[i]!
    systems[name] = round1(ms)
    ranked.push({ name, ms })
  }
  ranked.sort((a, b) => b.ms - a.ms)
  const bottlenecks = ranked.slice(0, 3).map((r) => r.name)

  const spikes: PerfReportJson['spikes'] = []
  for (let i = 0; i < PERF_CATEGORY_COUNT; i++) {
    const count = totals.spikeCounts[i]! + totals.hitchCounts[i]!
    if (count <= 0) continue
    spikes.push({ category: PERF_CATEGORIES[i]!, count })
  }
  spikes.sort((a, b) => b.count - a.count)

  const top = ranked[0]
  const recommendation = top
    ? `${top.name} is the primary sustained bottleneck.`
    : 'No CPU system stood out; cost may be GPU fill-rate inside RENDER.'

  return {
    durationSec,
    quality: ctx.quality,
    pixelRatio: ctx.pixelRatio,
    scenario,
    fps: {
      avg: round1(fpsAvg),
      min: Math.round(fpsMin),
      p1: Math.round(fpsP1),
    },
    frameTime: {
      avg: round1(avgMs),
      p95: round1(percentile(sorted, sorted.length, 95)),
      max: round1(totals.frameMsMax === Infinity ? 0 : totals.frameMsMax),
    },
    rendering: {
      drawCallsAvg: Math.round(totals.drawCallsSum / n),
      drawCallsMax: totals.drawCallsMax,
      trianglesAvg: Math.round(totals.trianglesSum / n),
    },
    systems,
    bottlenecks,
    spikes,
    recommendation,
    context: ctx,
  }
}

export function formatReport(report: PerfReportJson): string {
  const sysLines = Object.entries(report.systems)
    .map(([name, ms]) => `  ${name.padEnd(14)} ${ms.toFixed(1)} ms`)
    .join('\n')
  const bottlenecks = report.bottlenecks.map((b, i) => `  ${i + 1}. ${b}`).join('\n') || '  (none attributed)'
  const spikes = report.spikes.map((s) => `  ${s.category}: ${s.count}`).join('\n') || '  (none)'
  return [
    '[Seedvale Benchmark]',
    '',
    `Scenario: ${report.scenario}`,
    `Duration: ${report.durationSec}s`,
    `Quality: ${report.quality}`,
    `Pixel ratio: ${report.pixelRatio}`,
    '',
    'FPS:',
    `  avg: ${report.fps.avg}`,
    `  min: ${report.fps.min}`,
    `  p1: ${report.fps.p1}`,
    '',
    'Frame time:',
    `  avg: ${report.frameTime.avg} ms`,
    `  p95: ${report.frameTime.p95} ms`,
    `  max: ${report.frameTime.max} ms`,
    '',
    'Rendering:',
    `  draw calls: ${report.rendering.drawCallsAvg} avg / ${report.rendering.drawCallsMax} max`,
    `  triangles: ${formatTriangles(report.rendering.trianglesAvg)} avg`,
    '',
    'Systems:',
    sysLines || '  (no per-system CPU samples)',
    '',
    'Detected bottlenecks:',
    bottlenecks,
    '',
    'Critical spikes:',
    spikes,
    '',
    'Recommendation:',
    report.recommendation,
  ].join('\n')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function formatTriangles(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
