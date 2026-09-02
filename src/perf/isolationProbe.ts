import type { GpuTimer } from './gpuTimer'
import type { PerfMonitor } from './monitor'
import type { IsolationProbeRow } from './types'
import { percentile } from './percentile'
import {
  hideBuckets,
  restoreVisibility,
  type SceneBucket,
} from './sceneCensus'
import { PERF_CATEGORY_INDEX } from './types'
import type { Scene } from 'three'

const PROBE_SETTLE_MS = 150
const PROBE_SAMPLE_MS = 400
/** GPU timer queries resolve asynchronously, a few frames after submission —
 *  the game loop drains completed ones every tick regardless of probe state
 *  (`gameLoop.ts`'s unconditional `getGpuTimer().poll()`), so this is just a
 *  short grace window after a probe's CPU sampling ends before reading back
 *  whatever finished for that window. Not a stall: real frames keep
 *  rendering/ticking during this sleep exactly as during `PROBE_SAMPLE_MS`. */
const GPU_DRAIN_MS = 150

export type IsolationHost = {
  scene: Scene
  sun: { castShadow: boolean }
  applyPostConfig: () => void
  setAoEnabled: (on: boolean) => void
  setReflections: (on: boolean) => void
  setBloomEnabled: (on: boolean) => void
  setSmaaEnabled: (on: boolean) => void
  setGodRaysEnabled: (on: boolean) => void
  setFilmGradeEnabled: (on: boolean) => void
  /** Full `EffectComposer` bypass (direct `renderer.render(scene, camera)`)
   *  — distinct from the individual `setXEnabled` toggles above, which still
   *  leave `RenderPass`/`OutputPass` running through the composer. */
  setPostProcessingBypass: (on: boolean) => void
  /** WebGL2 GPU timestamp-query source for CPU/GPU render-cost separation
   *  (`gpuTimer.ts`) — `available: false` wherever the extension isn't
   *  exposed; probes must show that as a limitation, never fake a split. */
  gpuTimer: GpuTimer
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Samples one isolation probe window: CPU-side `RENDER` category time
 *  (avg/p95/max, from `SessionTotals.renderCategoryMs` — see `monitor.ts`)
 *  plus, when `gpuTimer.available`, the GPU-side elapsed time for that exact
 *  same span. The CPU number is `performance.now()` wall-clock around the
 *  render call, which can include driver/GPU wait — it is reported as such,
 *  never relabelled as isolated CPU cost. */
async function sampleProbe(monitor: PerfMonitor, gpuTimer: GpuTimer, id: string): Promise<IsolationProbeRow> {
  await sleep(PROBE_SETTLE_MS)
  gpuTimer.reset()
  monitor.beginSession()
  await sleep(PROBE_SAMPLE_MS)
  const totals = monitor.endSession()
  const n = Math.max(1, totals.frames)
  const renderSorted = [...totals.renderCategoryMs].sort((a, b) => a - b)

  const row: IsolationProbeRow = {
    id,
    renderMsAvg: totals.frames > 0 ? totals.categoryMsSum[PERF_CATEGORY_INDEX.RENDER]! / n : 0,
    renderMsP95: percentile(renderSorted, renderSorted.length, 95),
    renderMsMax: renderSorted.length > 0 ? renderSorted[renderSorted.length - 1]! : 0,
    drawCallsAvg: Math.round(totals.drawCallsSum / n),
    trianglesAvg: Math.round(totals.trianglesSum / n),
  }

  if (gpuTimer.available) {
    await sleep(GPU_DRAIN_MS)
    const gpuSorted = [...gpuTimer.samples()].sort((a, b) => a - b)
    if (gpuSorted.length > 0) {
      row.gpuMsAvg = gpuSorted.reduce((sum, v) => sum + v, 0) / gpuSorted.length
      row.gpuMsP95 = percentile(gpuSorted, gpuSorted.length, 95)
      row.gpuMsMax = gpuSorted[gpuSorted.length - 1]!
      row.gpuSamples = gpuSorted.length
    }
  }

  return row
}

/** Short visibility / graphics toggles after a benchmark. Restores state.
 *
 * `full` doubles as both the (1) baseline and, when `host.gpuTimer.available`,
 * the (6) CPU/GPU separation source — same window, both numbers for free.
 * `hide-water` is (2), `hide-vegetation-grass` is (3), `no-postprocessing`
 * (full composer bypass) is (4), and `no-reflections` already fully skips
 * the mirror render call (`waterMirror.ts`'s `render()` early-returns while
 * disabled) so it stands in for (5) without a redundant probe. */
export async function runIsolationProbes(
  host: IsolationHost,
  monitor: PerfMonitor,
): Promise<IsolationProbeRow[]> {
  const results: IsolationProbeRow[] = []
  const gpuTimer = host.gpuTimer
  const hideProbes: { id: string; buckets: SceneBucket[] }[] = [
    { id: 'hide-grass', buckets: ['grass'] },
    { id: 'hide-vegetation', buckets: ['vegetation'] },
    { id: 'hide-vegetation-grass', buckets: ['grass', 'vegetation'] },
    { id: 'hide-environment', buckets: ['environment'] },
    { id: 'hide-settlement', buckets: ['settlement'] },
    { id: 'hide-water', buckets: ['water'] },
    { id: 'hide-terrain', buckets: ['terrain'] },
    { id: 'hide-npc-fauna', buckets: ['npc', 'fauna'] },
  ]

  results.push(await sampleProbe(monitor, gpuTimer, 'full'))

  for (const probe of hideProbes) {
    const tokens = hideBuckets(host.scene, probe.buckets)
    try {
      results.push(await sampleProbe(monitor, gpuTimer, probe.id))
    } finally {
      restoreVisibility(tokens)
    }
  }

  const shadowWas = host.sun.castShadow
  host.sun.castShadow = false
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-shadows'))
  } finally {
    host.sun.castShadow = shadowWas
  }

  host.setAoEnabled(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-ao'))
  } finally {
    host.applyPostConfig()
  }

  host.setBloomEnabled(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-bloom'))
  } finally {
    host.applyPostConfig()
  }

  host.setSmaaEnabled(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-smaa'))
  } finally {
    host.applyPostConfig()
  }

  host.setGodRaysEnabled(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-god-rays'))
  } finally {
    host.applyPostConfig()
  }

  host.setFilmGradeEnabled(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-film-grade'))
  } finally {
    host.applyPostConfig()
  }

  host.setPostProcessingBypass(true)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-postprocessing'))
  } finally {
    host.setPostProcessingBypass(false)
  }

  host.setReflections(false)
  try {
    results.push(await sampleProbe(monitor, gpuTimer, 'no-reflections'))
  } finally {
    host.applyPostConfig()
  }

  return results
}

/** Maps the probes called out in the isolation-diagnostic request to
 *  human-readable labels; anything else keeps its raw `id`. */
const ISOLATION_LABELS: Record<string, string> = {
  full: 'baseline',
  'hide-water': 'no water',
  'hide-vegetation-grass': 'no vegetation/grass',
  'no-postprocessing': 'no postprocessing',
  'no-reflections': 'no mirrors',
}

function formatDiff(deltaMs: number, baselineMs: number): string {
  const pct = baselineMs > 0 ? (deltaMs / baselineMs) * 100 : 0
  const sign = deltaMs >= 0 ? '+' : ''
  return `${sign}${deltaMs.toFixed(1)} ms (${sign}${pct.toFixed(0)}%)`
}

/** Console report for `runIsolationProbes()`'s rows: avg/p95/max render time
 *  per probe plus the diff vs baseline, and a dedicated CPU/GPU separation
 *  section for the baseline window. Every render-time number is explicitly
 *  labelled as CPU-side wall-clock time (can include driver/GPU wait) unless
 *  the GPU-timer section below it actually measured GPU-side elapsed time —
 *  never presented as isolated CPU cost otherwise. */
export function formatIsolationReport(rows: readonly IsolationProbeRow[]): string {
  if (rows.length === 0) return '[Seedvale Render Isolation]\n\nNo isolation probes were run for this benchmark.'

  const baseline = rows.find((r) => r.id === 'full') ?? rows[0]!
  const idWidth = Math.max(...rows.map((r) => (ISOLATION_LABELS[r.id] ?? r.id).length))
  const tableLines = rows.map((r) => {
    const label = ISOLATION_LABELS[r.id] ?? r.id
    const diff = r.id === baseline.id ? '—' : formatDiff(r.renderMsAvg - baseline.renderMsAvg, baseline.renderMsAvg)
    return `  ${label.padEnd(idWidth)}  avg=${r.renderMsAvg.toFixed(1)} ms  p95=${r.renderMsP95.toFixed(1)} ms  max=${r.renderMsMax.toFixed(1)} ms  Δavg vs baseline=${diff}`
  })

  const gpuLines = baseline.gpuMsAvg !== undefined
    ? [
      `  EXT_disjoint_timer_query_webgl2: available (${baseline.gpuSamples} sample${baseline.gpuSamples === 1 ? '' : 's'} resolved during the baseline window)`,
      `  GPU elapsed   avg=${baseline.gpuMsAvg.toFixed(1)} ms  p95=${baseline.gpuMsP95!.toFixed(1)} ms  max=${baseline.gpuMsMax!.toFixed(1)} ms`,
      `  CPU wall      avg=${baseline.renderMsAvg.toFixed(1)} ms  p95=${baseline.renderMsP95.toFixed(1)} ms  max=${baseline.renderMsMax.toFixed(1)} ms`,
      '  CPU wall time already includes any driver/GPU wait around the render call — read "CPU wall minus GPU elapsed" as an approximate upper bound, not an exact isolated CPU-only cost.',
    ]
    : [
      '  NOT MEASURED — EXT_disjoint_timer_query_webgl2 is unavailable in this WebGL2 context (unsupported by the GPU/driver/browser, or no query resolved during the baseline window).',
      '  Every render time above is CPU-side wall-clock time only (performance.now() around the render call) — it may include driver/GPU wait and must not be read as isolated CPU cost.',
    ]

  return [
    '[Seedvale Render Isolation]',
    '',
    'Render time = RENDER category wall-clock (postprocess + label render, performance.now() around the call). This includes any driver/GPU wait unless the CPU/GPU separation section below actually measured GPU-side time — it is not isolated CPU cost on its own.',
    '',
    ...tableLines,
    '',
    'CPU/GPU separation (baseline, same RENDER span):',
    ...gpuLines,
  ].join('\n')
}
