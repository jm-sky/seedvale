import type { SceneCensus } from './sceneCensus'

/** Categories from plan 103 §2. CPU timers attribute work to these buckets.
 *  SHADOWS / POSTPROCESS are reserved for future GPU-pass splits — today's
 *  Three.js composer is one `RENDER` submission, so those two stay empty
 *  rather than guessing. */
export const PERF_CATEGORIES = [
  'TERRAIN',
  'GRASS',
  'VEGETATION',
  'PROPS',
  'SHADOWS',
  'POSTPROCESS',
  'WATER',
  'STREAMING',
  'NPC',
  'FAUNA',
  'PHYSICS',
  'RENDER',
] as const

export type PerfCategory = (typeof PERF_CATEGORIES)[number]

export const PERF_CATEGORY_COUNT = PERF_CATEGORIES.length

export const PERF_CATEGORY_INDEX: Record<PerfCategory, number> = {
  TERRAIN: 0,
  GRASS: 1,
  VEGETATION: 2,
  PROPS: 3,
  SHADOWS: 4,
  POSTPROCESS: 5,
  WATER: 6,
  STREAMING: 7,
  NPC: 8,
  FAUNA: 9,
  PHYSICS: 10,
  RENDER: 11,
}

export type PerfSeverity = 'debug' | 'info' | 'warning' | 'critical'

export const PERF_SEVERITY_RANK: Record<PerfSeverity, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  critical: 3,
}

export type PerfFilter = {
  categories?: readonly PerfCategory[]
  minSeverity?: PerfSeverity
}

export type HitchEvent = {
  category: PerfCategory
  durationMs: number
  atMs: number
  label?: string
}

export type ScenarioAnchor = { x: number; z: number }

export type ScenarioRoute = {
  startX: number
  startZ: number
  speedMps: number
  updateMs: number
  durationSec: number
}

export type PerfContext = {
  loadedChunks: number
  npcCount: number
  faunaCount: number
  pixelRatio: number
  quality: string
  seed?: number
  terrainResolution?: number
  loadRadius?: number
  geometries?: number
  textures?: number
  /** Reproducibility fields (plan tools-001) — only populated for a
   *  `?benchmark=` run built from `BENCHMARK_FIXTURE`; absent for ordinary
   *  gameplay/`?perf=1` sessions. */
  fixtureVersion?: string
  elapsedDays?: number
  timeOfDay?: number
  season?: string
  weather?: string
  viewportWidth?: number
  viewportHeight?: number
  scenarioAnchor?: ScenarioAnchor
  route?: ScenarioRoute
}

export type HitchReportRow = {
  category: PerfCategory
  label: string
  count: number
  avgMs: number
  maxMs: number
}

export type IsolationProbeRow = {
  id: string
  renderMsAvg: number
  drawCallsAvg: number
  trianglesAvg: number
}

export type PerfLiveStats = {
  enabled: boolean
  fps: number
  frameMs: number
  simulateMs: number
  renderMs: number
  p50: number
  p95: number
  p99: number
  minMs: number
  maxMs: number
  drawCalls: number
  triangles: number
  loadedChunks: number
  geometries: number
  textures: number
  mirrorDrawCalls: number
  mirrorTriangles: number
  categoryAvgMs: Record<PerfCategory, number>
}

export type BudgetKind = 'ok' | 'spike' | 'average_over' | 'sustained'

export type PerfSuspect = {
  category: PerfCategory
  ms: number
  share: number
}

export type PerfDetection = {
  kind: BudgetKind
  severity: PerfSeverity
  frameMs: number
  budgetMs: number
  suspects: PerfSuspect[]
  hitches: HitchEvent[]
}

export type PerfLogEvent = {
  category: PerfCategory
  severity: PerfSeverity
  message: string
  atMs: number
  detection?: PerfDetection
}

/** Frame-level vs. category/hitch evidence (plan tools-001 §5) — keeps the
 *  report from crediting an isolated, unattributed frame spike to whichever
 *  CPU category happened to average highest. `withCategory()` measures
 *  category time but does not itself create a hitch, so `frameMaxMs` can be
 *  much larger than `largestHitchMs`; the gap is `unattributedMs`. */
export type PerfAttribution = {
  frameMaxMs: number
  largestHitchMs: number
  unattributedMs: number
}

export type PerfReportJson = {
  durationSec: number
  quality: string
  pixelRatio: number
  scenario: string
  /** false for `current` (no fixed anchor) — excluded from automated
   *  baseline comparisons, still useful as an ad-hoc/debug run. */
  canonical: boolean
  fps: { avg: number; min: number; p1: number }
  frameTime: { avg: number; p95: number; max: number }
  rendering: {
    drawCallsAvg: number
    drawCallsMax: number
    trianglesAvg: number
    mirrorDrawCallsAvg?: number
    geometries?: number
    textures?: number
  }
  scene?: SceneCensus
  hitches?: HitchReportRow[]
  isolation?: IsolationProbeRow[]
  systems: Partial<Record<PerfCategory, number>>
  bottlenecks: string[]
  spikes: { category: string; count: number }[]
  attribution: PerfAttribution
  recommendation: string
  context: PerfContext
}
