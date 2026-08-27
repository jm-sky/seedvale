import type { SessionTotals } from './monitor'
import type { IsolationProbeRow, PerfContext, PerfReportJson } from './types'
import { percentile } from './percentile'
import { SCENE_BUCKETS, type SceneCensus } from './sceneCensus'
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
  scene?: SceneCensus
  isolation?: IsolationProbeRow[]
  /** False only for `current` (plan tools-001 §2) — no fixed anchor, so it
   *  can't be trusted in an automated baseline comparison. Defaults true. */
  canonical?: boolean
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

  const hitches = [...(totals.hitchByLabel?.values() ?? [])]
    .map((row) => ({
      category: row.category,
      label: row.label,
      count: row.count,
      avgMs: round1(row.sumMs / Math.max(1, row.count)),
      maxMs: round1(row.maxMs),
    }))
    .sort((a, b) => b.maxMs - a.maxMs)

  const frameMaxMs = totals.frameMsMax === Infinity ? 0 : totals.frameMsMax
  const largestHitchMs = hitches.reduce((max, h) => Math.max(max, h.maxMs), 0)
  const unattributedMs = Math.max(0, frameMaxMs - largestHitchMs)
  const p95Ms = percentile(sorted, sorted.length, 95)

  const top = ranked[0]
  const second = ranked[1]
  let recommendation: string
  // A single frame far above p95, with no labelled hitch to match it, is a
  // spike the report can't explain — do not credit it to the top CPU
  // category (plan tools-001 §5: sustained cost vs. frame spikes vs. no
  // attribution are distinct claims).
  if (frameMaxMs > 50 && unattributedMs > 0 && unattributedMs > p95Ms * 2) {
    recommendation = `Largest frame (${round1(frameMaxMs)} ms) is not explained by labelled hitches (largest ${round1(largestHitchMs)} ms) — unattributed frame spike, not a category bottleneck.`
  } else if (!top) {
    recommendation = 'No CPU system stood out; cost may be GPU fill-rate inside RENDER.'
  } else if (top.name === 'RENDER') {
    // EffectComposer submission can include GPU wait, so a high RENDER
    // average is not proof of CPU cost — isolation probes distinguish this.
    recommendation = 'RENDER is the largest sustained CPU-measured category, but composer submission time can include GPU wait — not confirmed as a CPU bottleneck without isolation probes.'
  } else if (second && top.ms < second.ms * 1.3) {
    recommendation = `No single system dominates sustained cost — ${ranked.slice(0, 3).map((r) => r.name).join(', ')} are comparable.`
  } else {
    recommendation = `${top.name} is the primary sustained bottleneck.`
  }

  return {
    durationSec,
    quality: ctx.quality,
    pixelRatio: ctx.pixelRatio,
    scenario,
    canonical: input.canonical ?? true,
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
      mirrorDrawCallsAvg: Math.round((totals.mirrorDrawCallsSum ?? 0) / n),
      geometries: ctx.geometries ?? totals.geometriesLast,
      textures: ctx.textures ?? totals.texturesLast,
    },
    scene: input.scene,
    hitches,
    isolation: input.isolation,
    systems,
    bottlenecks,
    spikes,
    attribution: {
      frameMaxMs: round1(frameMaxMs),
      largestHitchMs: round1(largestHitchMs),
      unattributedMs: round1(unattributedMs),
    },
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
  const hitchLines = (report.hitches ?? [])
    .map((h) => `  ${h.label.padEnd(22)} n=${h.count} avg=${h.avgMs.toFixed(1)} max=${h.maxMs.toFixed(1)}`)
    .join('\n')
  const sceneLines = report.scene
    ? SCENE_BUCKETS
      .map((bucket) => {
        const row = report.scene![bucket]
        if (row.drawCalls <= 0) return null
        return `  ${bucket.padEnd(14)} draws=${row.drawCalls} tris=${formatTriangles(row.triangles)} meshes=${row.meshes} inst=${row.instances}`
      })
      .filter((line): line is string => line !== null)
      .join('\n')
    : ''
  const isolationLines = (report.isolation ?? [])
    .map((row) => `  ${row.id.padEnd(18)} render=${row.renderMsAvg.toFixed(1)} ms draws=${row.drawCallsAvg} tris=${formatTriangles(row.trianglesAvg)}`)
    .join('\n')
  const ctx = report.context
  const reproLines = [
    ctx.fixtureVersion ? `  fixture: ${ctx.fixtureVersion}` : null,
    ctx.seed != null ? `  seed: ${ctx.seed}` : null,
    ctx.elapsedDays != null ? `  elapsedDays: ${ctx.elapsedDays}` : null,
    ctx.timeOfDay != null ? `  timeOfDay: ${ctx.timeOfDay.toFixed(3)}` : null,
    ctx.season ? `  season: ${ctx.season}` : null,
    ctx.weather ? `  weather: ${ctx.weather}` : null,
    ctx.terrainResolution != null ? `  terrainResolution: ${ctx.terrainResolution}` : null,
    ctx.loadRadius != null ? `  loadRadius: ${ctx.loadRadius}` : null,
    ctx.viewportWidth != null && ctx.viewportHeight != null ? `  viewport: ${ctx.viewportWidth}x${ctx.viewportHeight}` : null,
    ctx.scenarioAnchor ? `  anchor: (${round1(ctx.scenarioAnchor.x)}, ${round1(ctx.scenarioAnchor.z)})` : null,
    ctx.route ? `  route: start=(${round1(ctx.route.startX)}, ${round1(ctx.route.startZ)}) speed=${ctx.route.speedMps} m/s duration=${ctx.route.durationSec}s` : null,
  ].filter((line): line is string => line !== null)

  return [
    '[Seedvale Benchmark]',
    '',
    `Scenario: ${report.scenario}${report.canonical ? '' : ' (non-canonical)'}`,
    `Duration: ${report.durationSec}s`,
    `Quality: ${report.quality}`,
    `Pixel ratio: ${report.pixelRatio}`,
    '',
    'Reproducibility:',
    reproLines.join('\n') || '  (no fixture context)',
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
    `  mirror draws: ${report.rendering.mirrorDrawCallsAvg ?? 0} avg`,
    `  geometries: ${report.rendering.geometries ?? report.context.geometries ?? 0}`,
    `  textures: ${report.rendering.textures ?? report.context.textures ?? 0}`,
    '',
    'Scene (one-pass estimate):',
    sceneLines || '  (not sampled)',
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
    'Hitches (>= 8 ms):',
    hitchLines || '  (none)',
    '',
    'Isolation probes:',
    isolationLines || '  (not run)',
    '',
    'Frame attribution:',
    `  frame max: ${report.attribution.frameMaxMs} ms`,
    `  largest labelled hitch: ${report.attribution.largestHitchMs} ms`,
    `  unattributed: ${report.attribution.unattributedMs} ms`,
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
