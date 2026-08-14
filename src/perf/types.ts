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

export type PerfContext = {
  loadedChunks: number
  npcCount: number
  faunaCount: number
  pixelRatio: number
  quality: string
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

export type PerfReportJson = {
  durationSec: number
  quality: string
  pixelRatio: number
  scenario: string
  fps: { avg: number; min: number; p1: number }
  frameTime: { avg: number; p95: number; max: number }
  rendering: { drawCallsAvg: number; drawCallsMax: number; trianglesAvg: number }
  systems: Partial<Record<PerfCategory, number>>
  bottlenecks: string[]
  spikes: { category: string; count: number }[]
  recommendation: string
  context: PerfContext
}
