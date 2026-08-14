import type {
  BudgetKind,
  HitchEvent,
  PerfCategory,
  PerfDetection,
  PerfSeverity,
  PerfSuspect,
} from './types'
import { PERF_CATEGORIES, PERF_CATEGORY_COUNT, PERF_CATEGORY_INDEX } from './types'

const SPIKE_MEDIAN_RATIO = 1.5
const MIN_SHARE = 0.08
const MAX_SUSPECTS = 3

export type DetectFrameInput = {
  frameMs: number
  medianMs: number
  p95Ms: number
  budgetMs: number
  categoryMs: Float64Array
  hitches: readonly HitchEvent[]
  /** Consecutive percentile-windows whose p95 exceeded the budget. */
  sustainedWindows: number
  sustainedNeeded: number
}

function kindOf(input: DetectFrameInput): BudgetKind {
  if (input.sustainedWindows >= input.sustainedNeeded) return 'sustained'
  if (input.p95Ms > input.budgetMs) return 'average_over'
  if (input.frameMs > input.budgetMs && input.frameMs > input.medianMs * SPIKE_MEDIAN_RATIO) {
    return 'spike'
  }
  return 'ok'
}

function severityOf(kind: BudgetKind, frameMs: number, budgetMs: number): PerfSeverity {
  if (kind === 'ok') return 'debug'
  if (kind === 'spike') return frameMs > budgetMs * 2 ? 'warning' : 'info'
  if (kind === 'average_over') return 'warning'
  return 'critical'
}

/** Rank CPU category times as suspects. Empty categories and tiny shares are
 *  dropped so we don't pretend we know a GPU-only cause. */
export function rankSuspects(
  categoryMs: Float64Array,
  frameMs: number,
  hitches: readonly HitchEvent[],
): PerfSuspect[] {
  const denom = Math.max(frameMs, 0.001)
  const suspects: PerfSuspect[] = []
  for (let i = 0; i < PERF_CATEGORY_COUNT; i++) {
    const ms = categoryMs[i] ?? 0
    if (ms <= 0) continue
    const share = ms / denom
    if (share < MIN_SHARE) continue
    suspects.push({ category: PERF_CATEGORIES[i]!, ms, share })
  }
  for (const hitch of hitches) {
    const share = hitch.durationMs / denom
    if (share < MIN_SHARE) continue
    const existing = suspects.find((s) => s.category === hitch.category)
    if (existing) {
      if (hitch.durationMs > existing.ms) {
        existing.ms = hitch.durationMs
        existing.share = share
      }
    } else {
      suspects.push({ category: hitch.category, ms: hitch.durationMs, share })
    }
  }
  suspects.sort((a, b) => b.ms - a.ms)
  return suspects.slice(0, MAX_SUSPECTS)
}

export function detectFrame(input: DetectFrameInput): PerfDetection | null {
  const kind = kindOf(input)
  if (kind === 'ok') return null
  const suspects = rankSuspects(input.categoryMs, input.frameMs, input.hitches)
  if (suspects.length === 0 && input.categoryMs[PERF_CATEGORY_INDEX.RENDER]! > 0) {
    suspects.push({
      category: 'RENDER',
      ms: input.categoryMs[PERF_CATEGORY_INDEX.RENDER]!,
      share: input.categoryMs[PERF_CATEGORY_INDEX.RENDER]! / Math.max(input.frameMs, 0.001),
    })
  }
  return {
    kind,
    severity: severityOf(kind, input.frameMs, input.budgetMs),
    frameMs: input.frameMs,
    budgetMs: input.budgetMs,
    suspects,
    hitches: input.hitches.slice(),
  }
}

export function primaryCategory(detection: PerfDetection): PerfCategory {
  return detection.suspects[0]?.category ?? 'RENDER'
}
