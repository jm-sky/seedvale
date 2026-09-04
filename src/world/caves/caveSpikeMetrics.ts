/** Plan world-terrain-008 §13 — shared metrics shape + median-of-N runner
 *  for both spikes. Reuses `console.table` (the existing convention for
 *  structured debug output, e.g. `bootMark.ts`) instead of a new
 *  `CaveDebugManager`.
 *
 * @domain world-terrain
 */

export type CaveSpikeVariant = 'sweep' | 'sdf'

export type CaveSpikeMetrics = {
  variant: CaveSpikeVariant
  topologyBuildMs: number
  representationMs: number
  meshBuildMs: number
  vertices: number
  triangles: number
  geometryBytes: number
  peakTempBytes: number | null
  bounds: { min: [number, number, number], max: [number, number, number] }
  params: unknown
  detailEnabled: boolean
}

/** Runs `build` `n` times (plan §13: prefer the median over a single
 *  sample), returning the last built result plus a metrics object whose
 *  timing fields are the median across runs. */
export function runMedianOfN<T extends { metrics: CaveSpikeMetrics }>(build: () => T, n = 9): T {
  const results: T[] = []
  for (let i = 0; i < n; i++) results.push(build())
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]!
  }
  const last = results[results.length - 1]!
  return {
    ...last,
    metrics: {
      ...last.metrics,
      topologyBuildMs: median(results.map((r) => r.metrics.topologyBuildMs)),
      representationMs: median(results.map((r) => r.metrics.representationMs)),
      meshBuildMs: median(results.map((r) => r.metrics.meshBuildMs)),
    },
  }
}

/** `console.table`-friendly flattening of a `CaveSpikeMetrics`. */
export function reportCaveSpikeMetrics(metrics: CaveSpikeMetrics): void {
  console.log(`[caveSpike] variant=${metrics.variant}`)
  console.table({
    topologyBuildMs: metrics.topologyBuildMs,
    representationMs: metrics.representationMs,
    meshBuildMs: metrics.meshBuildMs,
    vertices: metrics.vertices,
    triangles: metrics.triangles,
    geometryBytes: metrics.geometryBytes,
    peakTempBytes: metrics.peakTempBytes ?? 'n/a',
    detailEnabled: metrics.detailEnabled,
  })
}
