import type {
  HitchEvent,
  PerfCategory,
  PerfContext,
  PerfFilter,
  PerfLiveStats,
  PerfLogEvent,
} from './types'
import { detectFrame, primaryCategory } from './detector'
import { createPerfLog } from './log'
import { copyAndSort, percentile } from './percentile'
import {
  PERF_CATEGORIES,
  PERF_CATEGORY_COUNT,
  PERF_CATEGORY_INDEX,
} from './types'

const RING = 300
const PERCENTILE_EVERY = 30
const SUSTAINED_WINDOWS = 3
const HITCH_MS = 8
const EMPTY_CONTEXT: PerfContext = {
  loadedChunks: 0,
  npcCount: 0,
  faunaCount: 0,
  pixelRatio: 1,
  quality: 'High',
}

export type FrameEndInput = {
  simulateMs: number
  renderMs: number
  drawCalls: number
  triangles: number
  geometries?: number
  textures?: number
  mirrorDrawCalls?: number
  mirrorTriangles?: number
}

export type SessionTotals = {
  frames: number
  frameMsSum: number
  frameMsMin: number
  frameMsMax: number
  frameMs: number[]
  drawCallsSum: number
  drawCallsMax: number
  trianglesSum: number
  categoryMsSum: Float64Array
  spikeCounts: Int32Array
  hitchCounts: Int32Array
  hitchByLabel: Map<string, { category: PerfCategory; label: string; count: number; sumMs: number; maxMs: number }>
  mirrorDrawCallsSum: number
  geometriesLast: number
  texturesLast: number
}

export type PerfMonitor = {
  isEnabled: () => boolean
  setSource: (source: 'url' | 'gui' | 'benchmark', on: boolean) => void
  begin: (category: PerfCategory) => void
  end: (category: PerfCategory) => void
  recordHitch: (category: PerfCategory, durationMs: number, label?: string) => void
  endFrame: (input: FrameEndInput) => void
  getLiveStats: () => PerfLiveStats
  setFilter: (filter: PerfFilter) => void
  events: () => readonly PerfLogEvent[]
  setContextProvider: (provider: () => PerfContext) => void
  getContext: () => PerfContext
  setBudgetMs: (ms: number) => void
  beginSession: () => void
  endSession: () => SessionTotals
  reset: () => void
}

function emptyCategoryAvg(): Record<PerfCategory, number> {
  const out = {} as Record<PerfCategory, number>
  for (let i = 0; i < PERF_CATEGORY_COUNT; i++) {
    out[PERF_CATEGORIES[i]!] = 0
  }
  return out
}

function emptySession(): SessionTotals {
  return {
    frames: 0,
    frameMsSum: 0,
    frameMsMin: Infinity,
    frameMsMax: 0,
    frameMs: [],
    drawCallsSum: 0,
    drawCallsMax: 0,
    trianglesSum: 0,
    categoryMsSum: new Float64Array(PERF_CATEGORY_COUNT),
    spikeCounts: new Int32Array(PERF_CATEGORY_COUNT),
    hitchCounts: new Int32Array(PERF_CATEGORY_COUNT),
    hitchByLabel: new Map(),
    mirrorDrawCallsSum: 0,
    geometriesLast: 0,
    texturesLast: 0,
  }
}

export function createPerfMonitor(budgetMs = 1000 / 60): PerfMonitor {
  const sources = { url: false, gui: false, benchmark: false }
  const starts = new Float64Array(PERF_CATEGORY_COUNT)
  starts.fill(Number.NaN)
  const accum = new Float64Array(PERF_CATEGORY_COUNT)
  const frameMsRing = new Float64Array(RING)
  const drawRing = new Float64Array(RING)
  const triRing = new Float64Array(RING)
  const categoryRing = new Float64Array(RING * PERF_CATEGORY_COUNT)
  const scratch = new Float64Array(RING)
  const hitchScratch: HitchEvent[] = []
  const log = createPerfLog()

  let write = 0
  let filled = 0
  let framesSincePct = 0
  let p50 = 0
  let p95 = 0
  let p99 = 0
  let minMs = 0
  let maxMs = 0
  let lastSimulate = 0
  let lastRender = 0
  let lastFrame = 0
  let lastDraw = 0
  let lastTris = 0
  let lastGeometries = 0
  let lastTextures = 0
  let lastMirrorDraw = 0
  let lastMirrorTris = 0
  let lastLoaded = 0
  let categoryAvg = emptyCategoryAvg()
  let overBudgetWindows = 0
  let session: SessionTotals | null = null
  let contextProvider: () => PerfContext = () => EMPTY_CONTEXT
  let currentBudget = budgetMs

  const enabled = () => sources.url || sources.gui || sources.benchmark

  function refreshPercentiles(): void {
    if (filled === 0) {
      p50 = p95 = p99 = minMs = maxMs = 0
      return
    }
    copyAndSort(frameMsRing, filled, scratch)
    p50 = percentile(scratch, filled, 50)
    p95 = percentile(scratch, filled, 95)
    p99 = percentile(scratch, filled, 99)
    minMs = scratch[0] ?? 0
    maxMs = scratch[filled - 1] ?? 0
    const catSums = new Float64Array(PERF_CATEGORY_COUNT)
    for (let f = 0; f < filled; f++) {
      const base = f * PERF_CATEGORY_COUNT
      for (let c = 0; c < PERF_CATEGORY_COUNT; c++) {
        catSums[c]! += categoryRing[base + c]!
      }
    }
    const next = emptyCategoryAvg()
    for (let c = 0; c < PERF_CATEGORY_COUNT; c++) {
      next[PERF_CATEGORIES[c]!] = catSums[c]! / filled
    }
    categoryAvg = next
  }

  return {
    isEnabled: enabled,
    setSource(source, on) {
      sources[source] = on
    },
    begin(category) {
      if (!enabled()) return
      starts[PERF_CATEGORY_INDEX[category]] = performance.now()
    },
    end(category) {
      if (!enabled()) return
      const i = PERF_CATEGORY_INDEX[category]
      const t0 = starts[i]!
      if (!Number.isFinite(t0)) return
      accum[i]! += performance.now() - t0
      starts[i] = Number.NaN
    },
    recordHitch(category, durationMs, label) {
      if (!enabled()) return
      if (durationMs < HITCH_MS) return
      hitchScratch.push({
        category,
        durationMs,
        atMs: performance.now(),
        label,
      })
      if (session) {
        session.hitchCounts[PERF_CATEGORY_INDEX[category]]! += 1
        const key = `${category}:${label ?? category}`
        const existing = session.hitchByLabel.get(key)
        if (existing) {
          existing.count += 1
          existing.sumMs += durationMs
          existing.maxMs = Math.max(existing.maxMs, durationMs)
        } else {
          session.hitchByLabel.set(key, {
            category,
            label: label ?? category,
            count: 1,
            sumMs: durationMs,
            maxMs: durationMs,
          })
        }
      }
      log.push({
        category,
        severity: durationMs > currentBudget ? 'warning' : 'info',
        message: `${label ?? category.toLowerCase()} hitch ${durationMs.toFixed(1)} ms`,
        atMs: performance.now(),
      })
    },
    endFrame(input) {
      lastSimulate = input.simulateMs
      lastRender = input.renderMs
      lastFrame = input.simulateMs + input.renderMs
      lastDraw = input.drawCalls
      lastTris = input.triangles
      lastGeometries = input.geometries ?? lastGeometries
      lastTextures = input.textures ?? lastTextures
      lastMirrorDraw = input.mirrorDrawCalls ?? 0
      lastMirrorTris = input.mirrorTriangles ?? 0
      lastLoaded = contextProvider().loadedChunks
      if (!enabled()) {
        accum.fill(0)
        hitchScratch.length = 0
        return
      }

      const idx = write
      frameMsRing[idx] = lastFrame
      drawRing[idx] = input.drawCalls
      triRing[idx] = input.triangles
      const base = idx * PERF_CATEGORY_COUNT
      for (let c = 0; c < PERF_CATEGORY_COUNT; c++) {
        categoryRing[base + c] = accum[c]!
      }
      write = (write + 1) % RING
      if (filled < RING) filled++

      if (session) {
        session.frames++
        session.frameMsSum += lastFrame
        session.frameMs.push(lastFrame)
        session.frameMsMin = Math.min(session.frameMsMin, lastFrame)
        session.frameMsMax = Math.max(session.frameMsMax, lastFrame)
        session.drawCallsSum += input.drawCalls
        session.drawCallsMax = Math.max(session.drawCallsMax, input.drawCalls)
        session.trianglesSum += input.triangles
        session.mirrorDrawCallsSum += input.mirrorDrawCalls ?? 0
        session.geometriesLast = input.geometries ?? session.geometriesLast
        session.texturesLast = input.textures ?? session.texturesLast
        for (let c = 0; c < PERF_CATEGORY_COUNT; c++) {
          session.categoryMsSum[c]! += accum[c]!
        }
      }

      framesSincePct++
      if (framesSincePct >= PERCENTILE_EVERY || filled < PERCENTILE_EVERY) {
        framesSincePct = 0
        refreshPercentiles()
        if (p95 > currentBudget) overBudgetWindows++
        else overBudgetWindows = 0
      }

      const detection = detectFrame({
        frameMs: lastFrame,
        medianMs: p50 || lastFrame,
        p95Ms: p95,
        budgetMs: currentBudget,
        categoryMs: accum,
        hitches: hitchScratch,
        sustainedWindows: overBudgetWindows,
        sustainedNeeded: SUSTAINED_WINDOWS,
      })
      if (detection) {
        if (detection.kind === 'spike' && session) {
          const cat = primaryCategory(detection)
          const index = PERF_CATEGORY_INDEX[cat]
          session.spikeCounts[index] += 1
        }
        if (detection.kind !== 'spike') {
          const top = detection.suspects[0]
          const label = top
            ? `${top.category} ${top.ms.toFixed(1)} ms (${Math.round(top.share * 100)}%)`
            : 'RENDER (undifferentiated)'
          log.push({
            category: primaryCategory(detection),
            severity: detection.severity,
            message: `${detection.kind} frame ${lastFrame.toFixed(1)} ms — ${label}`,
            atMs: performance.now(),
            detection,
          })
        }
      }

      accum.fill(0)
      starts.fill(Number.NaN)
      hitchScratch.length = 0
    },
    getLiveStats() {
      return {
        enabled: enabled(),
        fps: lastFrame > 0 ? 1000 / lastFrame : 0,
        frameMs: lastFrame,
        simulateMs: lastSimulate,
        renderMs: lastRender,
        p50,
        p95,
        p99,
        minMs,
        maxMs,
        drawCalls: lastDraw,
        triangles: lastTris,
        loadedChunks: lastLoaded,
        geometries: lastGeometries,
        textures: lastTextures,
        mirrorDrawCalls: lastMirrorDraw,
        mirrorTriangles: lastMirrorTris,
        categoryAvgMs: categoryAvg,
      }
    },
    setFilter: (filter) => log.setFilter(filter),
    events: () => log.events(),
    setContextProvider(provider) {
      contextProvider = provider
    },
    getContext: () => contextProvider(),
    setBudgetMs(ms) {
      currentBudget = ms
    },
    beginSession() {
      session = emptySession()
      filled = 0
      write = 0
      framesSincePct = 0
      overBudgetWindows = 0
      accum.fill(0)
      hitchScratch.length = 0
      log.clear()
    },
    endSession() {
      const totals = session ?? emptySession()
      session = null
      return totals
    },
    reset() {
      filled = 0
      write = 0
      framesSincePct = 0
      overBudgetWindows = 0
      accum.fill(0)
      starts.fill(Number.NaN)
      hitchScratch.length = 0
      categoryAvg = emptyCategoryAvg()
      p50 = p95 = p99 = minMs = maxMs = 0
      session = null
      log.clear()
    },
  }
}

export function withCategory(monitor: PerfMonitor, category: PerfCategory, fn: () => void): void {
  if (!monitor.isEnabled()) {
    fn()
    return
  }
  monitor.begin(category)
  try {
    fn()
  } finally {
    monitor.end(category)
  }
}
